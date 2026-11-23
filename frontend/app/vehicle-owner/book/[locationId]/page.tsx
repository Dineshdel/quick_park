'use client';

import type { BookingDto, LocationDto, PlanType, QuoteDto } from '@qp/types';
import { formatPlate, PLAN_RULES } from '@qp/validation';
import { useQuery } from '@tanstack/react-query';
import Link from 'next/link';
import { useParams, useRouter, useSearchParams } from 'next/navigation';
import { Suspense, useEffect, useMemo, useRef, useState } from 'react';
import { api, errorMessage } from '@/shared/lib/api';
import { fmtDateTime, formatRupees, planUnit, toLocalInput } from '@/shared/lib/format';
import { FormField } from '@/shared/forms/form-field';
import { PageShell } from '@/shared/layout/page-shell';
import { Alert } from '@/shared/ui/alert';
import { Button } from '@/shared/ui/button';
import { Card, CardContent, CardHeader, CardTitle } from '@/shared/ui/card';
import { Input } from '@/shared/ui/input';
import { Select } from '@/shared/ui/select';
import { useVehicles } from '../../_components/use-vehicles';

const ORDER: PlanType[] = ['HOURLY', 'DAILY', 'WEEKLY', 'MONTHLY', 'YEARLY', 'EVENT'];

function BookForm() {
  const { locationId } = useParams<{ locationId: string }>();
  const params = useSearchParams();
  const router = useRouter();
  const vehicles = useVehicles();
  const place = useQuery({
    queryKey: ['place-by-id', locationId],
    queryFn: () => api<LocationDto>(`/parkings/by-id/${locationId}`),
  });

  const [vehicleId, setVehicleId] = useState('');
  const [planType, setPlanType] = useState<PlanType>('HOURLY');
  const [start, setStart] = useState(() => {
    const date = params.get('date');
    const d = date ? new Date(`${date}T09:00`) : new Date(Date.now() + 15 * 60_000);
    if (!date) d.setMinutes(Math.ceil(d.getMinutes() / 15) * 15, 0, 0);
    return toLocalInput(d);
  });
  const [quantity, setQuantity] = useState(1);
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const idemKey = useRef(`book-${crypto.randomUUID()}`);

  const vehicle = vehicles.data?.find((v) => v.id === vehicleId);
  const plans = useMemo(() => {
    if (!place.data || !vehicle) return [];
    return ORDER.filter((pl) => place.data.prices.some((p) => p.vehicleTypeId === vehicle.vehicleType.id && p.planType === pl && p.isActive));
  }, [place.data, vehicle]);

  useEffect(() => {
    if (vehicles.data && !vehicleId) {
      const wanted = params.get('vehicleType');
      setVehicleId((vehicles.data.find((v) => v.vehicleType.id === wanted) ?? vehicles.data[0])?.id ?? '');
    }
  }, [vehicles.data, vehicleId, params]);
  useEffect(() => {
    if (plans.length && !plans.includes(planType)) setPlanType(plans[0]!);
  }, [plans, planType]);

  const quoteBody = vehicle && plans.includes(planType) ? { locationId, vehicleTypeId: vehicle.vehicleType.id, planType, startAt: new Date(start).toISOString(), quantity } : null;
  const quote = useQuery({
    queryKey: ['quote', quoteBody],
    queryFn: () => api<QuoteDto>('/parkings/quote', { body: quoteBody }),
    enabled: !!quoteBody,
    retry: false,
  });

  const book = async () => {
    if (!vehicle) return;
    setBusy(true);
    setError(null);
    try {
      const b = await api<BookingDto>('/bookings', {
        body: { locationId, vehicleId: vehicle.id, planType, startAt: new Date(start).toISOString(), quantity },
        headers: { 'Idempotency-Key': idemKey.current },
      });
      router.push(`/vehicle-owner/bookings/${b.id}`);
    } catch (e) {
      setError(errorMessage(e));
      idemKey.current = `book-${crypto.randomUUID()}`;
      setBusy(false);
    }
  };

  if (place.isPending || vehicles.isPending) return <p className="text-sm text-muted-foreground">Loading…</p>;
  if (place.isError) return <Alert variant="destructive">This parking place is not available.</Alert>;
  const p = place.data;
  if (!vehicles.data?.length) {
    return (
      <Alert>
        Add a vehicle first.{' '}
        <Link className="underline" href="/vehicle-owner/vehicles">
          Add vehicle
        </Link>
      </Alert>
    );
  }
  const offeredTypes = new Set(p.capacities.filter((c) => c.onlineSlots > 0).map((c) => c.vehicleTypeId));

  return (
    <div className="grid items-start gap-6 lg:grid-cols-[1fr_340px]">
      <Card>
        <CardHeader>
          <CardTitle className="text-lg">{p.name}</CardTitle>
          <p className="text-sm text-muted-foreground">{p.address}, {p.city}</p>
        </CardHeader>
        <CardContent className="grid gap-4">
          <FormField label="Vehicle">
            <Select value={vehicleId} onChange={(e) => setVehicleId(e.target.value)}>
              {vehicles.data.map((v) => (
                <option key={v.id} value={v.id} disabled={!offeredTypes.has(v.vehicleType.id)}>
                  {formatPlate(v.plateNumber)} · {v.vehicleType.name}
                  {offeredTypes.has(v.vehicleType.id) ? '' : ' (not offered here)'}
                </option>
              ))}
            </Select>
          </FormField>
          {vehicle && !plans.length ? (
            <Alert>No plans are offered for {vehicle.vehicleType.name.toLowerCase()}s here.</Alert>
          ) : (
            <>
              <FormField label="Plan">
                <Select value={planType} onChange={(e) => setPlanType(e.target.value as PlanType)}>
                  {plans.map((pl) => (
                    <option key={pl} value={pl}>
                      {PLAN_RULES[pl].label} · {formatRupees(p.prices.find((x) => x.vehicleTypeId === vehicle?.vehicleType.id && x.planType === pl)!.pricePaise)}/{planUnit(pl)}
                    </option>
                  ))}
                </Select>
              </FormField>
              {planType !== 'EVENT' && (
                <div className="grid gap-4 sm:grid-cols-2">
                  <FormField label="Start" hint={p.is24x7 ? 'Open 24×7' : 'Hourly bookings must fit opening hours'}>
                    <Input type="datetime-local" value={start} min={toLocalInput(new Date())} onChange={(e) => setStart(e.target.value)} />
                  </FormField>
                  <FormField label={`Number of ${planUnit(planType)}s`}>
                    <Input type="number" min={1} max={PLAN_RULES[planType].maxQty} value={quantity} onChange={(e) => setQuantity(Math.max(1, Math.min(PLAN_RULES[planType].maxQty, Number(e.target.value) || 1)))} />
                  </FormField>
                </div>
              )}
            </>
          )}
        </CardContent>
      </Card>

      <Card className="lg:sticky lg:top-4">
        <CardHeader>
          <CardTitle className="text-lg">Summary</CardTitle>
        </CardHeader>
        <CardContent className="grid gap-3 text-sm">
          {quote.isFetching && <p className="text-muted-foreground">Checking price and slots…</p>}
          {quote.isError && <Alert variant="destructive">{errorMessage(quote.error)}</Alert>}
          {quote.data && (
            <>
              <div className="grid gap-1">
                <p>
                  <span className="text-muted-foreground">From</span> {fmtDateTime(quote.data.startAt)}
                </p>
                <p>
                  <span className="text-muted-foreground">Until</span> {fmtDateTime(quote.data.endAt)}
                </p>
                <p>
                  <span className="text-muted-foreground">Price</span> {formatRupees(quote.data.unitPaise)} × {quote.data.quantity}
                </p>
              </div>
              <p className="text-2xl font-semibold">{formatRupees(quote.data.amountPaise)}</p>
              <p className={quote.data.free ? 'text-success' : 'text-destructive'}>{quote.data.free ? `${quote.data.free} slot${quote.data.free === 1 ? '' : 's'} free for this time` : 'Fully booked for this time'}</p>
            </>
          )}
          {error && <Alert variant="destructive">{error}</Alert>}
          <Button size="lg" loading={busy} disabled={!quote.data?.free} onClick={book}>
            Hold slot &amp; pay
          </Button>
          <p className="text-xs text-muted-foreground">Prices include taxes. See the cancellation policy on the place page.</p>
        </CardContent>
      </Card>
    </div>
  );
}

export default function BookPage() {
  return (
    <PageShell title="Book parking">
      <Suspense>
        <BookForm />
      </Suspense>
    </PageShell>
  );
}

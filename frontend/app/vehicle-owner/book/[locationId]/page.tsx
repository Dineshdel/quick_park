'use client';

import type { BookingDto, LocationDto, PlanType, QuoteDto } from '@qp/types';
import { formatPlate, PLAN_RULES } from '@qp/validation';
import { useQuery } from '@tanstack/react-query';
import Link from 'next/link';
import { useParams, useRouter, useSearchParams } from 'next/navigation';
import { Suspense, useEffect, useMemo, useRef, useState } from 'react';
import {
  bookableZones,
  hasNamedSlots,
  nearestFloors,
  useSlotAvailability,
  useZoneAvailability,
} from '@/shared/booking/floors';
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
import { ErrorPopup, useConfirm } from '@/shared/ui/confirm-dialog';

const ORDER: PlanType[] = ['HOURLY', 'DAILY', 'WEEKLY', 'MONTHLY', 'YEARLY', 'EVENT'];

function BookForm() {
  const ask = useConfirm();
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
  /** Floor/zone id; null = any floor. */
  const [zoneId, setZoneId] = useState<string | null>(params.get('zone'));
  /** Named slot (P01…) on the chosen floor; null = any free slot, assigned when booking. */
  const [slotId, setSlotId] = useState<string | null>(params.get('slot'));
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const idemKey = useRef(`book-${crypto.randomUUID()}`);

  const vehicle = vehicles.data?.find((v) => v.id === vehicleId);
  const plans = useMemo(() => {
    if (!place.data || !vehicle) return [];
    return ORDER.filter((pl) =>
      place.data.prices.some(
        (p) => p.vehicleTypeId === vehicle.vehicleType.id && p.planType === pl && p.isActive,
      ),
    );
  }, [place.data, vehicle]);

  useEffect(() => {
    if (vehicles.data && !vehicleId) {
      const wanted = params.get('vehicleType');
      setVehicleId(
        (vehicles.data.find((v) => v.vehicleType.id === wanted) ?? vehicles.data[0])?.id ?? '',
      );
    }
  }, [vehicles.data, vehicleId, params]);
  useEffect(() => {
    if (plans.length && !plans.includes(planType)) setPlanType(plans[0]!);
  }, [plans, planType]);
  const zones = useMemo(
    () => (place.data && vehicle ? bookableZones(place.data.areas, vehicle.vehicleType.id) : []),
    [place.data, vehicle],
  );
  useEffect(() => {
    // A floor without slots for this vehicle type can't be booked: fall back to any floor.
    if (zoneId && place.data && !zones.some((z) => z.id === zoneId)) setZoneId(null);
  }, [zones, zoneId, place.data]);
  // A slot belongs to one floor: changing floor (or vehicle) clears it.
  const slotFloor = useRef(zoneId);
  useEffect(() => {
    if (slotFloor.current !== zoneId) setSlotId(null);
    slotFloor.current = zoneId;
  }, [zoneId]);

  const quoteBody =
    vehicle && plans.includes(planType)
      ? {
          locationId,
          vehicleTypeId: vehicle.vehicleType.id,
          planType,
          startAt: new Date(start).toISOString(),
          quantity,
          zoneId,
          slotId,
        }
      : null;
  const quote = useQuery({
    queryKey: ['quote', quoteBody],
    queryFn: () => api<QuoteDto>('/parkings/quote', { body: quoteBody }),
    enabled: !!quoteBody,
    retry: false,
  });
  // Floor availability for the quoted window (the quote knows the exact start/end for every plan).
  const floors = useZoneAvailability(
    locationId,
    vehicle?.vehicleType.id ?? '',
    quote.data?.startAt,
    quote.data?.endAt,
    zones.length > 0,
  );
  const named =
    !!place.data && !!vehicle && hasNamedSlots(place.data.areas, zoneId, vehicle.vehicleType.id);
  const slotList = useSlotAvailability(
    locationId,
    vehicle?.vehicleType.id ?? '',
    named ? zoneId : null,
    quote.data?.startAt,
    quote.data?.endAt,
  );
  const slots = slotList.data?.slots ?? [];
  const slotLabel = slots.find((s) => s.id === slotId)?.label;
  useEffect(() => {
    // The vehicle type or floor changed and the slot isn't on the list any more.
    if (slotId && slotList.data && !slotList.data.slots.some((s) => s.id === slotId))
      setSlotId(null);
  }, [slotId, slotList.data]);
  const floorFree = useMemo(
    () => Object.fromEntries((floors.data?.zones ?? []).map((z) => [z.zoneId, z.free])),
    [floors.data],
  );
  // Area dropdown → floor dropdown. The area is derived from the chosen floor ('' = any area, any floor).
  const areaIndex = zones.find((z) => z.id === zoneId)?.areaIndex;
  const areaOptions = place.data
    ? place.data.areas
        .map((a, i) => ({ index: i, name: a.name }))
        .filter((a) => zones.some((z) => z.areaIndex === a.index))
    : [];
  const freeLabel = (id: string) =>
    floors.data ? ((floorFree[id] ?? 0) > 0 ? ` (${floorFree[id]} free)` : ' (Full)') : '';
  const areaFree = (i: number) =>
    zones.filter((z) => z.areaIndex === i).reduce((n, z) => Math.max(n, floorFree[z.id] ?? 0), 0);
  const pickArea = (value: string) => {
    if (value === '') return setZoneId(null);
    const inArea = zones.filter((z) => z.areaIndex === Number(value));
    // Start on the first floor in that area that has space (falls back to its first floor).
    setZoneId((inArea.find((z) => (floorFree[z.id] ?? 0) > 0) ?? inArea[0])?.id ?? null);
  };
  const zoneName = (id: string | null) => {
    const z = zones.find((x) => x.id === id);
    return z ? `${z.name} · ${z.areaName}` : 'Any floor';
  };

  const book = async () => {
    if (!vehicle) return;
    if (
      !(await ask(
        place.data?.isFree
          ? {
              title: 'Book this free slot?',
              description: 'No payment needed: your booking is confirmed straight away.',
              confirmLabel: 'Book for free',
            }
          : {
              title: 'Hold this slot and pay?',
              description: quote.data
                ? `Total ${formatRupees(quote.data.amountPaise)}. The slot is held for you while you pay.`
                : undefined,
              confirmLabel: 'Hold slot & pay',
            },
      ))
    )
      return;
    setBusy(true);
    setError(null);
    try {
      const b = await api<BookingDto>('/bookings', {
        body: {
          locationId,
          vehicleId: vehicle.id,
          planType,
          startAt: new Date(start).toISOString(),
          quantity,
          zoneId,
          slotId,
        },
        headers: { 'Idempotency-Key': idemKey.current },
      });
      router.push(`/vehicle-owner/bookings/${b.id}`);
    } catch (e) {
      setError(errorMessage(e));
      idemKey.current = `book-${crypto.randomUUID()}`;
      setBusy(false);
    }
  };

  if (place.isPending || vehicles.isPending)
    return <p className="text-sm text-muted-foreground">Loading…</p>;
  if (place.isError)
    return <Alert variant="destructive">This parking place is not available.</Alert>;
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
  const offeredTypes = new Set(
    p.capacities.filter((c) => c.onlineSlots > 0).map((c) => c.vehicleTypeId),
  );

  return (
    <div className="grid items-start gap-6 lg:grid-cols-[1fr_340px]">
      <Card>
        <CardHeader>
          <CardTitle className="text-lg">{p.name}</CardTitle>
          <p className="text-sm text-muted-foreground">
            {p.address}, {p.city}
          </p>
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
                      {PLAN_RULES[pl].label}
                      {p.isFree
                        ? ' · Free'
                        : ` · ${formatRupees(
                            p.prices.find(
                              (x) =>
                                x.vehicleTypeId === vehicle?.vehicleType.id && x.planType === pl,
                            )!.pricePaise,
                          )}/${planUnit(pl)}`}
                    </option>
                  ))}
                </Select>
              </FormField>
              {planType !== 'EVENT' && (
                <div className="grid gap-4 sm:grid-cols-2">
                  <FormField
                    label="Start"
                    hint={p.is24x7 ? 'Open 24×7' : 'Hourly bookings must fit opening hours'}
                  >
                    <Input
                      type="datetime-local"
                      value={start}
                      min={toLocalInput(new Date())}
                      onChange={(e) => setStart(e.target.value)}
                    />
                  </FormField>
                  <FormField label={`Number of ${planUnit(planType)}s`}>
                    <Input
                      type="number"
                      min={1}
                      max={PLAN_RULES[planType].maxQty}
                      value={quantity}
                      onChange={(e) =>
                        setQuantity(
                          Math.max(
                            1,
                            Math.min(PLAN_RULES[planType].maxQty, Number(e.target.value) || 1),
                          ),
                        )
                      }
                    />
                  </FormField>
                </div>
              )}
              {zones.length > 0 && vehicle && (
                <div className="grid gap-4 sm:grid-cols-2">
                  <FormField
                    label="Parking area"
                    hint={
                      areaIndex !== undefined
                        ? (p.areas[areaIndex]?.description ?? undefined)
                        : 'Any area gives the best chance of a slot'
                    }
                  >
                    <Select
                      value={areaIndex === undefined ? '' : String(areaIndex)}
                      onChange={(e) => pickArea(e.target.value)}
                    >
                      <option value="">
                        Any area · any floor{floors.data ? ` (${floors.data.free} free)` : ''}
                      </option>
                      {areaOptions.map((a) => (
                        <option key={a.index} value={a.index}>
                          {a.name}
                          {floors.data ? (areaFree(a.index) ? '' : ' (Full)') : ''}
                        </option>
                      ))}
                    </Select>
                  </FormField>
                  <FormField
                    label="Floor"
                    hint={
                      zoneId
                        ? zones.find((z) => z.id === zoneId)?.tags.join(' · ') || undefined
                        : 'Choose an area first, or leave it to us'
                    }
                  >
                    <Select
                      value={zoneId ?? ''}
                      disabled={areaIndex === undefined}
                      onChange={(e) => setZoneId(e.target.value || null)}
                    >
                      {areaIndex === undefined ? (
                        <option value="">Any floor</option>
                      ) : (
                        zones
                          .filter((z) => z.areaIndex === areaIndex)
                          .map((z) => (
                            <option key={z.id} value={z.id}>
                              {z.name}
                              {freeLabel(z.id)}
                            </option>
                          ))
                      )}
                    </Select>
                  </FormField>
                  {named && slots.length > 0 && (
                    <div className="sm:col-span-2">
                      <FormField
                        label="Parking slot"
                        hint={`${slots.filter((s) => s.free).length} of ${slots.length} slots free for this time`}
                      >
                        <Select
                          value={slotId ?? ''}
                          onChange={(e) => setSlotId(e.target.value || null)}
                        >
                          <option value="">Any free slot (we assign one when you book)</option>
                          {slots.map((s) => (
                            <option key={s.id} value={s.id} disabled={!s.free && s.id !== slotId}>
                              {s.label}
                              {s.free ? '' : ' (Booked)'}
                            </option>
                          ))}
                        </Select>
                      </FormField>
                    </div>
                  )}
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
          <ErrorPopup
            title="Can't book this"
            message={quote.isError ? errorMessage(quote.error) : null}
          />
          {quote.data && (
            <>
              <div className="grid gap-1">
                <p>
                  <span className="text-muted-foreground">From</span>{' '}
                  {fmtDateTime(quote.data.startAt)}
                </p>
                <p>
                  <span className="text-muted-foreground">Until</span>{' '}
                  {fmtDateTime(quote.data.endAt)}
                </p>
                {!p.isFree && (
                  <p>
                    <span className="text-muted-foreground">Price</span>{' '}
                    {formatRupees(quote.data.unitPaise)} × {quote.data.quantity}
                  </p>
                )}
                {zones.length > 0 && (
                  <p>
                    <span className="text-muted-foreground">Floor</span> {zoneName(zoneId)}
                  </p>
                )}
                {named && (
                  <p>
                    <span className="text-muted-foreground">Slot</span>{' '}
                    {slotLabel ?? 'Any free slot (assigned when you book)'}
                  </p>
                )}
              </div>
              <p className="text-2xl font-semibold">
                {p.isFree ? (
                  <span className="text-success">Free</span>
                ) : (
                  formatRupees(quote.data.amountPaise)
                )}
              </p>
              <p className={quote.data.free ? 'text-success' : 'text-destructive'}>
                {quote.data.free
                  ? `${quote.data.free} slot${quote.data.free === 1 ? '' : 's'} free for this time`
                  : slotId
                    ? `Slot ${slotLabel ?? ''} is taken for this time: pick another slot`
                    : zoneId
                      ? 'This floor is full for this time'
                      : 'Fully booked for this time'}
              </p>
              {zoneId && !slotId && !quote.data.free && vehicle && (
                <div className="grid gap-1.5">
                  {nearestFloors(p.areas, vehicle.vehicleType.id, zoneId, floorFree).map((z) => (
                    <Button
                      key={z.id}
                      size="sm"
                      variant="outline"
                      className="justify-between"
                      onClick={() => setZoneId(z.id)}
                    >
                      <span>
                        Try {z.name} · {z.areaName}
                      </span>
                      <span className="text-success">{floorFree[z.id]} free</span>
                    </Button>
                  ))}
                  {(floors.data?.free ?? 0) > 0 && (
                    <Button size="sm" variant="ghost" onClick={() => setZoneId(null)}>
                      Any floor ({floors.data!.free} free)
                    </Button>
                  )}
                </div>
              )}
            </>
          )}
          <ErrorPopup message={error} onClose={() => setError(null)} />
          <Button size="lg" loading={busy} disabled={!quote.data?.free} onClick={book}>
            {p.isFree ? 'Book for free' : 'Hold slot & pay'}
          </Button>
          <p className="text-xs text-muted-foreground">
            Prices include taxes. See the cancellation policy on the place page.
          </p>
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

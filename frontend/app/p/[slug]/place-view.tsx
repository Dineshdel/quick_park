'use client';

import type { LocationDto, PlanType } from '@qp/types';
import { useQuery } from '@tanstack/react-query';
import { Clock, MapPin, ShieldCheck } from 'lucide-react';
import Link from 'next/link';
import { useEffect, useState } from 'react';
import { AvailabilityCalendar } from '@/shared/booking/availability-calendar';
import { api, ApiError } from '@/shared/lib/api';
import { useSession } from '@/shared/lib/auth/use-session';
import { fmtDateTime, formatRupees, planUnit } from '@/shared/lib/format';
import { Map } from '@/shared/maps/map';
import { useLiveAvailability } from '@/shared/realtime/use-live-availability';
import { Alert } from '@/shared/ui/alert';
import { Badge } from '@/shared/ui/badge';
import { Button } from '@/shared/ui/button';
import { Card, CardContent, CardHeader, CardTitle } from '@/shared/ui/card';
import { Tabs } from '@/shared/ui/tabs';

const PLAN_ORDER: PlanType[] = ['HOURLY', 'DAILY', 'WEEKLY', 'MONTHLY', 'YEARLY', 'EVENT'];
const DAYS = ['Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat', 'Sun'];

/** Interactive place page; the server component (page.tsx) loads the place first for SEO and link previews. */
export function PlaceView({ initial, wantedType }: { initial: LocationDto; wantedType?: string }) {
  const slug = initial.slug;
  const s = useSession();
  const place = useQuery({ queryKey: ['place', slug], queryFn: () => api<LocationDto>(`/parkings/${slug}`), initialData: initial });
  const [vt, setVt] = useState<string>('');
  const { live } = useLiveAvailability(place.data?.id);

  useEffect(() => {
    if (!place.data || vt) return;
    const offeredTypes = place.data.capacities.filter((c) => c.onlineSlots > 0);
    setVt((offeredTypes.find((c) => c.vehicleTypeId === wantedType) ?? offeredTypes[0])?.vehicleTypeId ?? '');
  }, [place.data, vt, wantedType]);

  if (place.isPending) return <div className="mx-auto max-w-5xl px-4 py-8 text-sm text-muted-foreground">Loading…</div>;
  if (place.isError) {
    return (
      <div className="mx-auto max-w-5xl px-4 py-8">
        <Alert variant="destructive">{place.error instanceof ApiError && place.error.status === 404 ? 'This parking place is not available.' : 'Could not load this place.'}</Alert>
      </div>
    );
  }
  const p = place.data;
  const bookHref = (date?: string) => {
    const target = `/vehicle-owner/book/${p.id}?vehicleType=${vt}${date ? `&date=${date}` : ''}`;
    return s.status === 'authenticated' ? target : `/login?next=${encodeURIComponent(target)}`;
  };
  const canBook = s.status !== 'authenticated' || s.user.role === 'VEHICLE_OWNER';
  const offered = p.capacities.filter((c) => c.onlineSlots > 0);

  return (
    <div className="mx-auto grid max-w-5xl gap-6 px-4 py-8">
      <div className="grid gap-2">
        <div className="flex flex-wrap items-center gap-2">
          <h1 className="text-3xl font-bold tracking-tight">{p.name}</h1>
          <Badge variant="muted">{p.category.name}</Badge>
          {p.is24x7 && <Badge variant="info">Open 24×7</Badge>}
          {p.isEvent && <Badge variant="warning">Event: {p.eventName}</Badge>}
        </div>
        <p className="flex items-center gap-1 text-muted-foreground">
          <MapPin className="size-4" aria-hidden /> {p.address}, {p.city}
          {p.pincode ? ` ${p.pincode}` : ''}
        </p>
        {p.isEvent && p.eventStartAt && (
          <p className="text-sm">
            Event parking: {fmtDateTime(p.eventStartAt)} – {fmtDateTime(p.eventEndAt!)}
          </p>
        )}
      </div>

      {p.photos.length > 0 && (
        <div className="flex gap-2 overflow-x-auto pb-1">
          {p.photos.map((ph) => (
            <img key={ph.id} src={ph.url} alt={`${p.name} photo`} className="h-48 w-72 shrink-0 rounded-lg object-cover" />
          ))}
        </div>
      )}

      <div className="grid gap-6 lg:grid-cols-[1fr_380px]">
        <div className="grid content-start gap-6">
          {p.description && <p className="whitespace-pre-line">{p.description}</p>}

          <Card>
            <CardHeader>
              <CardTitle className="text-lg">Prices</CardTitle>
            </CardHeader>
            <CardContent className="overflow-x-auto">
              <table className="w-full text-sm">
                <thead className="text-left text-muted-foreground">
                  <tr>
                    <th className="py-1 pr-3 font-medium">Vehicle</th>
                    {PLAN_ORDER.filter((pl) => p.prices.some((x) => x.planType === pl && x.isActive)).map((pl) => (
                      <th key={pl} className="py-1 pr-3 font-medium">Per {planUnit(pl)}</th>
                    ))}
                    <th className="py-1 font-medium">Live</th>
                  </tr>
                </thead>
                <tbody>
                  {offered.map((c) => (
                    <tr key={c.vehicleTypeId} className="border-t">
                      <td className="py-2 pr-3 font-medium">{c.vehicleTypeName}</td>
                      {PLAN_ORDER.filter((pl) => p.prices.some((x) => x.planType === pl && x.isActive)).map((pl) => {
                        const price = p.prices.find((x) => x.vehicleTypeId === c.vehicleTypeId && x.planType === pl && x.isActive);
                        return (
                          <td key={pl} className="py-2 pr-3 tabular-nums">
                            {price ? formatRupees(price.pricePaise) : '—'}
                          </td>
                        );
                      })}
                      <td className="py-2 text-xs">
                        {live[c.vehicleTypeId] ? (
                          <span className={live[c.vehicleTypeId]!.free ? 'text-success' : 'text-destructive'}>{live[c.vehicleTypeId]!.free} free now</span>
                        ) : (
                          <span className="text-muted-foreground">{c.onlineSlots} bookable</span>
                        )}
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
              {offered.some((c) => c.overstayPerHourPaise > 0) && (
                <p className="mt-3 text-xs text-muted-foreground">
                  Overstay after your booking ends is charged per started hour at the gate (
                  {offered.filter((c) => c.overstayPerHourPaise).map((c) => `${c.vehicleTypeName} ${formatRupees(c.overstayPerHourPaise)}/h`).join(', ')}).
                </p>
              )}
            </CardContent>
          </Card>

          {offered.length > 0 && vt && (
            <Card>
              <CardHeader className="gap-3">
                <CardTitle className="text-lg">Availability</CardTitle>
                {offered.length > 1 && (
                  <Tabs value={vt} onChange={setVt} items={offered.map((c) => ({ value: c.vehicleTypeId, label: c.vehicleTypeName }))} />
                )}
              </CardHeader>
              <CardContent>
                <AvailabilityCalendar locationId={p.id} vehicleTypeId={vt} onPickDate={canBook ? (d) => (window.location.href = bookHref(d)) : undefined} />
              </CardContent>
            </Card>
          )}
        </div>

        <div className="grid content-start gap-4">
          <Card>
            <CardContent className="grid gap-3 pt-6">
              {canBook ? (
                <Button size="lg" asChild disabled={!offered.length}>
                  <Link href={bookHref()}>Book now</Link>
                </Button>
              ) : (
                <Alert>Sign in with a vehicle owner account to book.</Alert>
              )}
              {p.cancellationPolicy && (
                <div className="text-sm">
                  <p className="flex items-center gap-1 font-medium">
                    <ShieldCheck className="size-4" aria-hidden /> {p.cancellationPolicy.name} cancellation
                  </p>
                  <ul className="mt-1 text-muted-foreground">
                    {p.cancellationPolicy.rules.map((r) => (
                      <li key={r.hoursBefore}>
                        {r.hoursBefore === 0 ? 'Later' : `${r.hoursBefore}+ hours before start`}: {r.refundPct}% refund
                      </li>
                    ))}
                  </ul>
                </div>
              )}
              {!p.is24x7 && p.openingHours && (
                <div className="text-sm">
                  <p className="flex items-center gap-1 font-medium">
                    <Clock className="size-4" aria-hidden /> Opening hours
                  </p>
                  <ul className="mt-1 grid grid-cols-2 gap-x-3 text-muted-foreground">
                    {p.openingHours.map((d, i) => (
                      <li key={DAYS[i]}>
                        {DAYS[i]}: {d.closed ? 'Closed' : `${d.open}–${d.close}`}
                      </li>
                    ))}
                  </ul>
                </div>
              )}
              {p.amenities.length > 0 && (
                <div className="flex flex-wrap gap-1">
                  {p.amenities.map((a) => (
                    <Badge key={a} variant="muted">
                      {a}
                    </Badge>
                  ))}
                </div>
              )}
            </CardContent>
          </Card>
          <Map className="h-64" points={[{ id: p.id, lat: p.lat, lng: p.lng, label: p.name }]} />
          <a className="text-sm underline" href={`https://www.google.com/maps/dir/?api=1&destination=${p.lat},${p.lng}`} target="_blank" rel="noreferrer">
            Get directions
          </a>
        </div>
      </div>
    </div>
  );
}

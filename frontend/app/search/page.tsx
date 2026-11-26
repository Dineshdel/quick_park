'use client';

import type { Paginated, SearchResultDto } from '@qp/types';
import { useQuery } from '@tanstack/react-query';
import { Navigation } from 'lucide-react';
import Link from 'next/link';
import { useRouter, useSearchParams } from 'next/navigation';
import { Suspense, useEffect, useMemo, useRef, useState } from 'react';
import { api } from '@/shared/lib/api';
import { useSession } from '@/shared/lib/auth/use-session';
import { formatRupees, planUnit } from '@/shared/lib/format';
import { placeholderPhoto } from '@/shared/lib/placeholder-photo';
import { useVehicleTypes } from '@/shared/data/masters';
import { Map } from '@/shared/maps/map';
import { usePlaceSearch } from '@/shared/maps/places';
import { SearchBar } from '@/shared/search/search-bar';
import { Badge } from '@/shared/ui/badge';
import { Button } from '@/shared/ui/button';
import { Card, CardContent } from '@/shared/ui/card';
import { ErrorPopup } from '@/shared/ui/confirm-dialog';

function Results() {
  const params = useSearchParams();
  const router = useRouter();
  const s = useSession();
  const types = useVehicleTypes();
  const { suggest, resolve } = usePlaceSearch();
  const [hover, setHover] = useState<string | null>(null);
  const qs = params.toString();
  const res = useQuery({
    queryKey: ['search', qs],
    queryFn: () => api<Paginated<SearchResultDto>>(`/parkings/search?${qs}`),
  });
  const items = useMemo(() => res.data?.items ?? [], [res.data]);

  const lat = params.get('lat');
  const lng = params.get('lng');
  const near = lat !== null && lng !== null;
  const origin = useMemo(
    () => (near ? { lat: Number(lat), lng: Number(lng) } : null),
    [near, lat, lng],
  );
  const place = params.get('place');
  const q = params.get('q');
  const vt = params.get('vehicleType') ?? '';
  const vtName = types.data?.find((t) => t.id === vt)?.name;

  // Typed text matched no parking name → treat it as a place ("T Nagar", "Phoenix Mall") and search around it.
  const triedPlace = useRef<string | null>(null);
  const [lookingUp, setLookingUp] = useState(false);
  useEffect(() => {
    if (near || !q || res.isPending || items.length > 0 || triedPlace.current === q) return;
    triedPlace.current = q;
    setLookingUp(true);
    void (async () => {
      try {
        const [first] = await suggest(q);
        if (!first) return;
        const pl = await resolve(first);
        const sp = new URLSearchParams(params.toString());
        sp.delete('q');
        sp.set('lat', pl.lat.toFixed(5));
        sp.set('lng', pl.lng.toFixed(5));
        sp.set('place', pl.label);
        router.replace(`/search?${sp.toString()}`);
      } catch {
        /* keep the empty result */
      } finally {
        setLookingUp(false);
      }
    })();
  }, [near, q, res.isPending, items.length, suggest, resolve, params, router]);

  const points = useMemo(
    () =>
      items.map((p) => ({
        id: p.id,
        lat: p.lat,
        lng: p.lng,
        label: p.name,
        sub: p.isFree
          ? 'Free parking'
          : p.fromPaise !== null
            ? `from ${formatRupees(p.fromPaise)}/${planUnit(p.fromPlan!)}`
            : p.address,
        href: `/p/${p.slug}${vt ? `?vehicleType=${vt}` : ''}`,
      })),
    [items, vt],
  );

  const bookHref = (id: string) => {
    const target = `/vehicle-owner/book/${id}${vt ? `?vehicleType=${vt}` : ''}`;
    return s.status === 'authenticated' ? target : `/login?next=${encodeURIComponent(target)}`;
  };
  const canBook = s.status !== 'authenticated' || s.user.role === 'VEHICLE_OWNER';

  const heading = near
    ? `Parking near ${place ?? 'this place'}`
    : q
      ? `Parking matching “${q}”`
      : 'All parking places';
  const total = res.data?.total ?? 0;

  return (
    <div className="mx-auto grid max-w-6xl gap-6 px-4 py-6">
      <SearchBar compact />
      <div className="grid gap-6 lg:grid-cols-[1fr_440px]">
        <div className="grid content-start gap-3">
          <div>
            <h1 className="text-xl font-semibold">{heading}</h1>
            <p className="text-sm text-muted-foreground">
              {res.isPending || lookingUp
                ? 'Searching…'
                : `${total} place${total === 1 ? '' : 's'}${vtName ? ` for ${vtName.toLowerCase()}s` : ''}${near ? ' within 10 km, nearest first' : ''}`}
            </p>
          </div>
          <ErrorPopup message={res.isError ? 'Search failed. Please try again.' : null} />
          {!res.isPending && !lookingUp && items.length === 0 && (
            <Card>
              <CardContent className="py-10 text-center text-sm text-muted-foreground">
                No parking found{vtName ? ` for ${vtName.toLowerCase()}s` : ''}. Try another area,
                another vehicle type or remove filters.
              </CardContent>
            </Card>
          )}
          {items.map((p) => (
            <Card
              key={p.id}
              className={`overflow-hidden transition-colors ${hover === p.id ? 'border-primary' : ''}`}
              onMouseEnter={() => setHover(p.id)}
              onMouseLeave={() => setHover(null)}
            >
              <CardContent className="flex gap-4 p-3">
                <Link
                  href={`/p/${p.slug}${vt ? `?vehicleType=${vt}` : ''}`}
                  className="size-24 shrink-0 overflow-hidden rounded-2xl bg-muted"
                >
                  <img
                    src={p.photoUrl ?? placeholderPhoto(p.id, 300)}
                    alt=""
                    loading="lazy"
                    className="size-full object-cover"
                  />
                </Link>
                <div className="grid min-w-0 flex-1 content-start gap-1">
                  <div className="flex flex-wrap items-center gap-2">
                    <Link
                      href={`/p/${p.slug}${vt ? `?vehicleType=${vt}` : ''}`}
                      className="font-semibold hover:underline"
                    >
                      {p.name}
                    </Link>
                    <Badge variant="muted">{p.category}</Badge>
                    {p.is24x7 && <Badge variant="info">24×7</Badge>}
                    {p.isEvent && <Badge variant="warning">Event</Badge>}
                  </div>
                  <p className="truncate text-sm text-muted-foreground">
                    {p.address}, {p.city}
                  </p>
                  <div className="flex flex-wrap items-center gap-3 text-sm">
                    {p.isFree ? (
                      <Badge variant="success">Free parking</Badge>
                    ) : (
                      p.fromPaise !== null && (
                        <span>
                          from <b>{formatRupees(p.fromPaise)}</b>/{planUnit(p.fromPlan!)}
                        </span>
                      )
                    )}
                    {p.distanceKm !== null && (
                      <span className="flex items-center gap-1 text-muted-foreground">
                        <Navigation className="size-3" aria-hidden /> {p.distanceKm} km
                      </span>
                    )}
                    {p.free !== null && (
                      <span className={p.free ? 'text-success' : 'text-destructive'}>
                        {p.free ? `${p.free} free` : 'Full'}
                      </span>
                    )}
                  </div>
                  <div className="mt-1 flex flex-wrap gap-2">
                    {canBook && (
                      <Button size="sm" asChild>
                        <Link href={bookHref(p.id)}>Book</Link>
                      </Button>
                    )}
                    <Button size="sm" variant="outline" asChild>
                      <Link href={`/p/${p.slug}${vt ? `?vehicleType=${vt}` : ''}`}>Details</Link>
                    </Button>
                    <Button size="sm" variant="ghost" asChild>
                      <a
                        href={`https://www.google.com/maps/dir/?api=1&destination=${p.lat},${p.lng}`}
                        target="_blank"
                        rel="noreferrer"
                      >
                        Directions
                      </a>
                    </Button>
                  </div>
                </div>
              </CardContent>
            </Card>
          ))}
        </div>
        <div className="lg:sticky lg:top-32 lg:self-start">
          <Map className="h-[460px]" points={points} origin={origin} activeId={hover} />
        </div>
      </div>
    </div>
  );
}

export default function SearchPage() {
  return (
    <Suspense>
      <Results />
    </Suspense>
  );
}

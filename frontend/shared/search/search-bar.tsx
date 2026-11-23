'use client';

import type { VehicleDto } from '@qp/types';
import { useQuery } from '@tanstack/react-query';
import { Bike, Bus, BusFront, Car, Caravan, LocateFixed, Search, Truck, type LucideIcon } from 'lucide-react';
import { useRouter, useSearchParams } from 'next/navigation';
import { useEffect, useState } from 'react';
import { useSession } from '@/shared/lib/auth/use-session';
import { api } from '@/shared/lib/api';
import { cn } from '@/shared/lib/utils';
import { useCategories, useVehicleTypes } from '@/shared/data/masters';
import { Button } from '@/shared/ui/button';
import { Select } from '@/shared/ui/select';
import { useT } from '@/shared/i18n/i18n';
import { type MessageKey, MESSAGES } from '@/shared/i18n/messages';
import { PlaceSearchInput } from './place-search-input';

const ICONS: Record<string, LucideIcon> = { car: Car, bike: Bike, caravan: Caravan, 'bus-front': BusFront, bus: Bus, truck: Truck };

/**
 * Find parking: pick the vehicle type, then type a parking name or any area/landmark (Google Places),
 * or use "Near me". Results open on /search?vehicleType=…&lat=…&lng=…&place=… (or q=… for text).
 */
export function SearchBar({ compact = false }: { compact?: boolean }) {
  const router = useRouter();
  const params = useSearchParams();
  const s = useSession();
  const t = useT();
  const types = useVehicleTypes();
  const cats = useCategories();
  const isVehicleOwner = s.status === 'authenticated' && s.user.role === 'VEHICLE_OWNER';
  const myVehicles = useQuery({ queryKey: ['vehicles'], queryFn: () => api<VehicleDto[]>('/vehicles'), enabled: isVehicleOwner });

  const [text, setText] = useState(params.get('place') ?? params.get('q') ?? '');
  const [vehicleType, setVehicleType] = useState(params.get('vehicleType') ?? '');
  const [category, setCategory] = useState(params.get('category') ?? '');
  const [locating, setLocating] = useState(false);
  const [geoError, setGeoError] = useState<string | null>(null);

  // Logged-in vehicle owners start with their own vehicle's type selected.
  useEffect(() => {
    if (!params.has('vehicleType') && !vehicleType && myVehicles.data?.[0]) setVehicleType(myVehicles.data[0].vehicleType.id);
  }, [myVehicles.data, params, vehicleType]);

  const go = (extra: Record<string, string>, vt = vehicleType) => {
    const sp = new URLSearchParams();
    if (vt) sp.set('vehicleType', vt);
    if (category) sp.set('category', category);
    for (const [k, v] of Object.entries(extra)) if (v) sp.set(k, v);
    router.push(`/search?${sp.toString()}`);
  };

  /** Re-run the current search with another vehicle type (only on the results page). */
  const pickType = (id: string) => {
    setVehicleType(id);
    if (!compact) return;
    const sp = new URLSearchParams(params.toString());
    if (id) sp.set('vehicleType', id);
    else sp.delete('vehicleType');
    router.push(`/search?${sp.toString()}`);
  };

  const nearMe = () => {
    setGeoError(null);
    if (!navigator.geolocation) return setGeoError(t('search.noGeo'));
    setLocating(true);
    navigator.geolocation.getCurrentPosition(
      (pos) => {
        setLocating(false);
        setText('');
        go({ lat: pos.coords.latitude.toFixed(5), lng: pos.coords.longitude.toFixed(5), place: 'your location' });
      },
      () => {
        setLocating(false);
        setGeoError(t('search.allowGeo'));
      },
      { timeout: 10_000 },
    );
  };

  return (
    <form
      className={cn('grid w-full gap-3 text-left', !compact && 'shadow-premium-lg rounded-2xl border bg-card p-6')}
      onSubmit={(e) => {
        e.preventDefault();
        go({ q: text.trim() });
      }}
    >
      <div className="grid gap-1.5">
        <p className="text-sm font-medium">{t('search.yourVehicle')}</p>
        <div className="flex flex-wrap gap-2" role="radiogroup" aria-label={t('search.yourVehicle')}>
          {[{ id: '', name: t('search.any'), code: '', icon: null }, ...(types.data ?? [])].map((vt) => {
            const Icon = vt.icon ? ICONS[vt.icon] : null;
            const on = vehicleType === vt.id;
            return (
              <button
                key={vt.id || 'any'}
                type="button"
                role="radio"
                aria-checked={on}
                onClick={() => pickType(vt.id)}
                className={cn(
                  'inline-flex h-9 items-center gap-1.5 rounded-full border px-3 text-sm transition-colors',
                  on ? 'border-primary bg-primary text-primary-foreground' : 'hover:bg-accent',
                )}
              >
                {Icon && <Icon className="size-4" aria-hidden />}
                {vt.code && `vehicle.${vt.code}` in MESSAGES.en ? t(`vehicle.${vt.code}` as MessageKey) : vt.name}
              </button>
            );
          })}
        </div>
      </div>

      <div className="grid gap-2 md:grid-cols-[1fr_auto_auto_auto]">
        <PlaceSearchInput
          value={text}
          onChange={setText}
          vehicleType={vehicleType || undefined}
          onParking={(p) => router.push(`/p/${p.slug}${vehicleType ? `?vehicleType=${vehicleType}` : ''}`)}
          onPlace={(pl) => go({ lat: pl.lat.toFixed(5), lng: pl.lng.toFixed(5), place: pl.label })}
          onText={(q) => go({ q })}
        />
        <Select value={category} onChange={(e) => setCategory(e.target.value)} aria-label="Kind of parking" className="md:w-40">
          <option value="">{t('search.anyKind')}</option>
          {cats.data?.map((c) => (
            <option key={c.id} value={c.id}>
              {c.name}
            </option>
          ))}
        </Select>
        <Button type="submit">
          <Search /> {t('search.search')}
        </Button>
        <Button type="button" variant="outline" loading={locating} onClick={nearMe}>
          <LocateFixed /> {t('search.nearMe')}
        </Button>
      </div>
      {geoError && <p className="text-sm text-destructive">{geoError}</p>}
    </form>
  );
}

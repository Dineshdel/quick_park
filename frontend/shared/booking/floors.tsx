'use client';

import type { AreaDto, SlotAvailabilityDto, ZoneAvailabilityDto } from '@qp/types';
import { useQuery } from '@tanstack/react-query';
import { Building2, MapPin } from 'lucide-react';
import { api } from '@/shared/lib/api';
import { cn } from '@/shared/lib/utils';
import { Badge } from '@/shared/ui/badge';

/** Free slots per floor/zone for a window (each already capped by the place's overall free slots). */
export function useZoneAvailability(
  locationId: string | undefined,
  vehicleTypeId: string,
  start: string | undefined,
  end: string | undefined,
  enabled = true,
) {
  const qs =
    locationId && vehicleTypeId && start && end
      ? new URLSearchParams({ vehicleType: vehicleTypeId, start, end }).toString()
      : null;
  return useQuery({
    queryKey: ['zone-availability', locationId, qs],
    queryFn: () =>
      api<{ free: number; zones: ZoneAvailabilityDto[] }>(
        `/parkings/${locationId}/availability?${qs}`,
      ),
    enabled: enabled && !!qs,
    refetchInterval: 30_000,
  });
}

/** Named slots (P01…) on one floor with free/taken for a window; empty list when the floor has none. */
export function useSlotAvailability(
  locationId: string | undefined,
  vehicleTypeId: string,
  zoneId: string | null,
  start: string | undefined,
  end: string | undefined,
) {
  const qs =
    locationId && vehicleTypeId && zoneId && start && end
      ? new URLSearchParams({ vehicleType: vehicleTypeId, zone: zoneId, start, end }).toString()
      : null;
  return useQuery({
    queryKey: ['slot-availability', locationId, qs],
    queryFn: () => api<{ slots: SlotAvailabilityDto[] }>(`/parkings/${locationId}/slots?${qs}`),
    enabled: !!qs,
    refetchInterval: 30_000,
  });
}

/** True when the floor has named slots for this vehicle type. */
export const hasNamedSlots = (areas: AreaDto[], zoneId: string | null, vehicleTypeId: string) =>
  !!zoneId &&
  areas.some((a) =>
    a.zones.some(
      (z) =>
        z.id === zoneId && z.slots.some((s) => s.vehicleTypeId === vehicleTypeId && s.isOnline),
    ),
  );

interface FlatZone {
  id: string;
  name: string;
  level: number;
  tags: string[];
  areaIndex: number;
  areaName: string;
  online: number;
}

/** Floors that offer `vehicleTypeId` online, in area then floor order. */
export function bookableZones(areas: AreaDto[], vehicleTypeId: string): FlatZone[] {
  return areas.flatMap((a, areaIndex) =>
    a.zones.flatMap((z) => {
      const online = z.capacities.find((c) => c.vehicleTypeId === vehicleTypeId)?.onlineSlots ?? 0;
      return online > 0
        ? [
            {
              id: z.id,
              name: z.name,
              level: z.level,
              tags: z.tags,
              areaIndex,
              areaName: a.name,
              online,
            },
          ]
        : [];
    }),
  );
}

/** Nearest floors with free slots: same area first (closest level), then other areas. */
export function nearestFloors(
  areas: AreaDto[],
  vehicleTypeId: string,
  fromZoneId: string,
  free: Record<string, number>,
  max = 3,
): FlatZone[] {
  const zones = bookableZones(areas, vehicleTypeId);
  const from = zones.find((z) => z.id === fromZoneId);
  if (!from) return [];
  return zones
    .filter((z) => z.id !== fromZoneId && (free[z.id] ?? 0) > 0)
    .sort(
      (a, b) =>
        Number(a.areaIndex !== from.areaIndex) - Number(b.areaIndex !== from.areaIndex) ||
        Math.abs(a.level - from.level) - Math.abs(b.level - from.level) ||
        a.areaIndex - b.areaIndex,
    )
    .slice(0, max);
}

/**
 * Floors grouped by area with a free-slots bar. Read-only on the place page; with `onSelect` it becomes the floor
 * picker on the booking page (first option "Any floor").
 */
export function FloorList({
  areas,
  vehicleTypeId,
  free,
  placeFree,
  selected,
  onSelect,
}: {
  areas: AreaDto[];
  vehicleTypeId: string;
  free?: Record<string, number>;
  placeFree?: number;
  selected?: string | null;
  onSelect?: (zoneId: string | null) => void;
}) {
  const zones = bookableZones(areas, vehicleTypeId);
  if (!zones.length) return null;
  const pickable = !!onSelect;
  const Row = pickable ? 'button' : 'div';

  return (
    <div className="grid gap-3">
      {pickable && (
        <button
          type="button"
          onClick={() => onSelect(null)}
          className={cn(
            'flex items-center justify-between gap-3 rounded-lg border p-3 text-left text-sm transition-colors hover:bg-accent',
            !selected && 'border-primary ring-2 ring-primary/30',
          )}
        >
          <span>
            <b>Any floor</b>{' '}
            <span className="text-muted-foreground">(recommended: best chance of a slot)</span>
          </span>
          {placeFree !== undefined && <FreeText free={placeFree} />}
        </button>
      )}
      {areas.map((a, ai) => {
        const list = zones.filter((z) => z.areaIndex === ai);
        if (!list.length) return null;
        return (
          <div key={a.id} className="grid gap-1.5">
            <p className="flex flex-wrap items-center gap-1.5 text-sm font-medium">
              <Building2 className="size-4 text-muted-foreground" aria-hidden /> {a.name}
              {a.lat != null && a.lng != null && (
                <a
                  className="inline-flex items-center gap-0.5 text-xs font-normal underline"
                  href={`https://www.google.com/maps/dir/?api=1&destination=${a.lat},${a.lng}`}
                  target="_blank"
                  rel="noreferrer"
                >
                  <MapPin className="size-3" aria-hidden /> Directions
                </a>
              )}
            </p>
            {a.description && <p className="text-xs text-muted-foreground">{a.description}</p>}
            {list.map((z) => {
              const f = free?.[z.id];
              const pct =
                f === undefined
                  ? 0
                  : Math.round(((z.online - Math.min(f, z.online)) / z.online) * 100);
              const full = f === 0;
              return (
                <Row
                  key={z.id}
                  {...(pickable ? { type: 'button' as const, onClick: () => onSelect(z.id) } : {})}
                  className={cn(
                    'grid grid-cols-[minmax(4rem,auto)_1fr_auto] items-center gap-3 rounded-md border px-3 py-2 text-left text-sm',
                    pickable && 'transition-colors hover:bg-accent',
                    selected === z.id && 'border-primary ring-2 ring-primary/30',
                  )}
                >
                  <span className="font-medium">{z.name}</span>
                  <span className="grid gap-1">
                    {f !== undefined && (
                      <span className="h-1.5 overflow-hidden rounded-full bg-muted" aria-hidden>
                        <span
                          className={cn(
                            'block h-full rounded-full',
                            full ? 'bg-destructive' : pct >= 80 ? 'bg-amber-500' : 'bg-success',
                          )}
                          style={{ width: `${Math.max(pct, 3)}%` }}
                        />
                      </span>
                    )}
                    {z.tags.length > 0 && (
                      <span className="flex flex-wrap gap-1">
                        {z.tags.map((t) => (
                          <Badge key={t} variant="muted" className="px-1.5 py-0 text-[10px]">
                            {t}
                          </Badge>
                        ))}
                      </span>
                    )}
                  </span>
                  {f === undefined ? (
                    <span className="text-xs text-muted-foreground">{z.online} bookable</span>
                  ) : (
                    <FreeText free={f} />
                  )}
                </Row>
              );
            })}
          </div>
        );
      })}
    </div>
  );
}

function FreeText({ free }: { free: number }) {
  return (
    <span
      className={cn('text-xs font-medium tabular-nums', free ? 'text-success' : 'text-destructive')}
    >
      {free ? `${free} free` : 'Full'}
    </span>
  );
}

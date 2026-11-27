'use client';

import type { Paginated, SearchResultDto } from '@qp/types';
import { Loader2, MapPin, ParkingSquare, Search } from 'lucide-react';
import { useEffect, useId, useRef, useState } from 'react';
import { api } from '@/shared/lib/api';
import { cn } from '@/shared/lib/utils';
import { usePlaceSearch, type PlaceSuggestion, type ResolvedPlace } from '@/shared/maps/places';
import { useT } from '@/shared/i18n/i18n';

type Option = { kind: 'parking'; item: SearchResultDto } | { kind: 'place'; item: PlaceSuggestion };

/**
 * One search box for both: parking places by name (from our API) and areas/landmarks (Google Places or OSM).
 * Picking a parking calls onParking, picking an area calls onPlace with its coordinates,
 * pressing Enter without a pick calls onText.
 */
export function PlaceSearchInput({
  value,
  onChange,
  onParking,
  onPlace,
  onText,
  vehicleType,
  parkings = true,
  placeholder,
  className,
}: {
  value: string;
  onChange: (v: string) => void;
  onParking?: (p: SearchResultDto) => void;
  onPlace: (p: ResolvedPlace) => void;
  onText?: (q: string) => void;
  vehicleType?: string;
  /** Also suggest matching parking places (off for the owner's address picker). */
  parkings?: boolean;
  placeholder?: string;
  className?: string;
}) {
  const t = useT();
  const { suggest, resolve, provider } = usePlaceSearch();
  const [options, setOptions] = useState<Option[]>([]);
  const [open, setOpen] = useState(false);
  const [active, setActive] = useState(-1);
  const [busy, setBusy] = useState(false);
  const typed = useRef(false);
  const listId = useId();

  useEffect(() => {
    if (!typed.current) return;
    const q = value.trim();
    if (q.length < 2) {
      setOptions([]);
      setBusy(false);
      return;
    }
    let cancelled = false;
    setBusy(true);
    const t = setTimeout(async () => {
      const sp = new URLSearchParams({ q, pageSize: '4' });
      if (vehicleType) sp.set('vehicleType', vehicleType);
      const [lots, areas] = await Promise.all([
        parkings
          ? api<Paginated<SearchResultDto>>(`/parkings/search?${sp}`)
              .then((r) => r.items)
              .catch(() => [])
          : Promise.resolve([]),
        suggest(q).catch(() => []),
      ]);
      if (cancelled) return;
      setOptions([
        ...lots.map((item): Option => ({ kind: 'parking', item })),
        ...areas.map((item): Option => ({ kind: 'place', item })),
      ]);
      setActive(-1);
      setBusy(false);
      setOpen(true);
    }, 250);
    return () => {
      cancelled = true;
      clearTimeout(t);
    };
  }, [value, vehicleType, parkings, suggest]);

  const pick = async (o: Option) => {
    setOpen(false);
    typed.current = false;
    if (o.kind === 'parking') {
      onChange(o.item.name);
      onParking?.(o.item);
      return;
    }
    onChange(o.item.title);
    setBusy(true);
    try {
      onPlace(await resolve(o.item));
    } finally {
      setBusy(false);
    }
  };

  const firstPlace = options.findIndex((o) => o.kind === 'place');

  return (
    <div className={cn('relative', className)}>
      <Search
        className="pointer-events-none absolute top-1/2 left-3 size-4 -translate-y-1/2 text-muted-foreground"
        aria-hidden
      />
      <input
        role="combobox"
        aria-expanded={open && options.length > 0}
        aria-controls={listId}
        aria-autocomplete="list"
        aria-label="Search parking name or a place"
        autoComplete="off"
        value={value}
        placeholder={placeholder ?? t('search.placeholder')}
        onChange={(e) => {
          typed.current = true;
          onChange(e.target.value);
        }}
        onFocus={() => options.length && setOpen(true)}
        onBlur={() => setTimeout(() => setOpen(false), 150)}
        onKeyDown={(e) => {
          if (e.key === 'ArrowDown') {
            e.preventDefault();
            setOpen(true);
            setActive((a) => Math.min(a + 1, options.length - 1));
          } else if (e.key === 'ArrowUp') {
            e.preventDefault();
            setActive((a) => Math.max(a - 1, -1));
          } else if (e.key === 'Escape') {
            setOpen(false);
          } else if (e.key === 'Enter') {
            if (open && active >= 0 && options[active]) {
              e.preventDefault();
              void pick(options[active]);
            } else if (onText) {
              e.preventDefault();
              setOpen(false);
              onText(value.trim());
            }
          }
        }}
        className="flex h-10 w-full rounded-md border border-field-border bg-field py-2 pr-9 pl-9 text-base shadow-xs outline-none placeholder:text-muted-foreground focus-visible:border-ring focus-visible:ring-[3px] focus-visible:ring-ring/50 md:text-sm"
      />
      {busy && (
        <Loader2
          className="absolute top-1/2 right-3 size-4 -translate-y-1/2 animate-spin text-muted-foreground"
          aria-hidden
        />
      )}

      {open && options.length > 0 && (
        <ul
          id={listId}
          role="listbox"
          className="absolute z-[1000] mt-1 max-h-80 w-full overflow-auto rounded-md border bg-popover p-1 text-popover-foreground shadow-lg"
        >
          {options.map((o, i) => (
            <li key={o.kind + (o.kind === 'parking' ? o.item.id : o.item.id)}>
              {i === 0 && o.kind === 'parking' && (
                <p className="px-2 pt-1 pb-0.5 text-xs font-medium text-muted-foreground">
                  {t('search.groupParking')}
                </p>
              )}
              {i === firstPlace && (
                <p className="px-2 pt-1 pb-0.5 text-xs font-medium text-muted-foreground">
                  {t('search.groupNear')}
                </p>
              )}
              <button
                type="button"
                role="option"
                aria-selected={i === active}
                onMouseDown={(e) => e.preventDefault()}
                onClick={() => void pick(o)}
                onMouseEnter={() => setActive(i)}
                className={cn(
                  'flex w-full items-start gap-2 rounded px-2 py-1.5 text-left text-sm',
                  i === active && 'bg-accent',
                )}
              >
                {o.kind === 'parking' ? (
                  <ParkingSquare className="mt-0.5 size-4 shrink-0 text-primary" aria-hidden />
                ) : (
                  <MapPin className="mt-0.5 size-4 shrink-0 text-muted-foreground" aria-hidden />
                )}
                <span className="min-w-0">
                  <span className="block truncate font-medium">
                    {o.kind === 'parking' ? o.item.name : o.item.title}
                  </span>
                  <span className="block truncate text-xs text-muted-foreground">
                    {o.kind === 'parking' ? `${o.item.address}, ${o.item.city}` : o.item.subtitle}
                  </span>
                </span>
              </button>
            </li>
          ))}
          {provider === 'google' && firstPlace >= 0 && (
            <li className="px-2 pt-1 text-right text-[10px] text-muted-foreground">
              powered by Google
            </li>
          )}
        </ul>
      )}
    </div>
  );
}

'use client';

import type { Paginated, SearchResultDto } from '@qp/types';
import { useQuery } from '@tanstack/react-query';
import {
  Building2,
  ChevronRight,
  GraduationCap,
  Home,
  Hospital,
  MapPin,
  ParkingSquare,
  Plane,
  ShoppingBag,
  Store,
  Ticket,
  TrainFront,
  Trees,
  type LucideIcon,
} from 'lucide-react';
import Link from 'next/link';
import type { CSSProperties } from 'react';
import { useCategories } from '@/shared/data/masters';
import { useT } from '@/shared/i18n/i18n';
import { api } from '@/shared/lib/api';
import { formatRupees, planUnit } from '@/shared/lib/format';
import { placeholderPhoto } from '@/shared/lib/placeholder-photo';
import { AppTile, TILE_HUES } from '@/shared/ui/app-tile';

/** Category icon names (from the admin masters) → Lucide icons. */
const CATEGORY_ICONS: Record<string, LucideIcon> = {
  'shopping-bag': ShoppingBag,
  'building-2': Building2,
  'graduation-cap': GraduationCap,
  home: Home,
  hospital: Hospital,
  'train-front': TrainFront,
  shop: Store,
  plane: Plane,
  ticket: Ticket,
  trees: Trees,
};

function SectionHead({ title, href, action }: { title: string; href?: string; action?: string }) {
  return (
    <div className="flex items-end justify-between gap-4">
      <h2 className="text-2xl font-bold sm:text-3xl">{title}</h2>
      {href && action && (
        <Link
          href={href}
          className="flex items-center gap-0.5 text-sm font-semibold text-gold-deep hover:underline"
        >
          {action} <ChevronRight className="size-4" aria-hidden />
        </Link>
      )}
    </div>
  );
}

/** "Browse by place": the parking categories as a grid of app icons, each opening a filtered search. */
export function CategoryGrid() {
  const t = useT();
  const cats = useCategories();
  const list = (cats.data ?? []).filter((c) => c.isActive);
  return (
    <section className="qp-reveal grid gap-6">
      <SectionHead title={t('home.browseTitle')} href="/search" action={t('home.seeAll')} />
      <div className="surface-3d grid grid-cols-4 gap-x-2 gap-y-4 rounded-3xl border bg-card p-4 sm:grid-cols-5 sm:p-6 lg:grid-cols-10">
        {cats.isPending
          ? Array.from({ length: 10 }, (_, i) => (
              <div key={i} className="grid justify-items-center gap-2 p-2" aria-hidden>
                <span className="size-14 animate-pulse rounded-[30%] bg-muted" />
                <span className="h-3 w-12 animate-pulse rounded bg-muted" />
              </div>
            ))
          : list.map((c, i) => {
              const Icon = (c.icon && CATEGORY_ICONS[c.icon]) || ParkingSquare;
              return (
                <AppTile
                  key={c.id}
                  href={`/search?category=${c.id}`}
                  label={c.name}
                  hue={TILE_HUES[i % TILE_HUES.length]!}
                  icon={<Icon aria-hidden />}
                  className="rise-in"
                  style={{ '--i': i } as CSSProperties}
                />
              );
            })}
      </div>
    </section>
  );
}

/** "Popular parking": a swipeable row of photo cards, like an app store's featured row. */
export function PopularRow() {
  const t = useT();
  const res = useQuery({
    queryKey: ['search', 'popular'],
    queryFn: () => api<Paginated<SearchResultDto>>('/parkings/search?pageSize=12'),
    staleTime: 120_000,
  });
  const items = res.data?.items ?? [];
  if (res.isSuccess && !items.length) return null;
  return (
    <section className="qp-reveal grid gap-6">
      <SectionHead title={t('home.popularTitle')} href="/search" action={t('home.seeAll')} />
      <ul className="-mx-4 flex snap-x snap-mandatory gap-4 overflow-x-auto px-4 pt-1 pb-6 [scrollbar-width:none] [&::-webkit-scrollbar]:hidden">
        {res.isPending
          ? Array.from({ length: 4 }, (_, i) => (
              <li
                key={i}
                className="h-72 w-[78%] shrink-0 animate-pulse rounded-3xl bg-muted sm:w-72"
                aria-hidden
              />
            ))
          : items.map((p, i) => (
              <li
                key={p.id}
                className="rise-in w-[78%] shrink-0 snap-start sm:w-72"
                style={{ '--i': i } as CSSProperties}
              >
                <Link
                  href={`/p/${p.slug}`}
                  className="surface-3d group block overflow-hidden rounded-3xl border bg-card transition-transform duration-300 hover:-translate-y-1.5"
                >
                  <div className="relative h-44 overflow-hidden">
                    <img
                      src={p.photoUrl ?? placeholderPhoto(p.id, 600)}
                      alt=""
                      loading="lazy"
                      className="size-full object-cover transition-transform duration-700 group-hover:scale-105"
                    />
                    <span
                      className="absolute inset-0 bg-gradient-to-t from-black/60 via-transparent to-transparent"
                      aria-hidden
                    />
                    <span className="absolute top-3 left-3 flex gap-1.5">
                      {p.is24x7 && (
                        <span className="glass-dark rounded-full px-2.5 py-0.5 text-[11px] font-semibold text-white">
                          24×7
                        </span>
                      )}
                      {p.isEvent && (
                        <span className="glass-dark rounded-full px-2.5 py-0.5 text-[11px] font-semibold text-white">
                          Event
                        </span>
                      )}
                    </span>
                    <span className="absolute bottom-3 left-3 rounded-full bg-white/95 px-3 py-1 text-xs font-bold text-[oklch(0.3_0.12_248)] shadow-lg">
                      {p.isFree
                        ? t('home.freeParking')
                        : p.fromPaise !== null
                          ? `${formatRupees(p.fromPaise)}/${planUnit(p.fromPlan!)}`
                          : p.category}
                    </span>
                  </div>
                  <div className="grid gap-1 p-4">
                    <p className="truncate font-semibold group-hover:text-gold-deep">{p.name}</p>
                    <p className="flex items-center gap-1 truncate text-sm text-muted-foreground">
                      <MapPin className="size-3.5 shrink-0" aria-hidden />
                      {p.city} · {p.category}
                    </p>
                  </div>
                </Link>
              </li>
            ))}
      </ul>
    </section>
  );
}

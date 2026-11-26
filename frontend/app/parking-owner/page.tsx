'use client';

import type { OwnerDashboardDto } from '@qp/types';
import { useQuery } from '@tanstack/react-query';
import {
  BarChart3,
  CalendarCheck,
  Camera,
  Car,
  ClipboardList,
  IndianRupee,
  MapPinned,
  PlusCircle,
  ScanLine,
  UserCheck,
  Wallet,
} from 'lucide-react';
import Link from 'next/link';
import type { CSSProperties } from 'react';
import {
  Area,
  AreaChart,
  CartesianGrid,
  ResponsiveContainer,
  Tooltip,
  XAxis,
  YAxis,
} from 'recharts';
import { PageShell } from '@/shared/layout/page-shell';
import { api } from '@/shared/lib/api';
import { useSession } from '@/shared/lib/auth/use-session';
import { formatRupees } from '@/shared/lib/format';
import { placeholderPhoto } from '@/shared/lib/placeholder-photo';
import { Alert } from '@/shared/ui/alert';
import { AppTile, TILE_HUES } from '@/shared/ui/app-tile';
import { StatusPill } from '@/shared/ui/badge';
import { Button } from '@/shared/ui/button';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/shared/ui/card';
import { Gauge } from '@/shared/ui/gauge';
import { Kpi } from '@/shared/ui/kpi';
import { Tilt } from '@/shared/ui/tilt';
import { useOwnerProfile } from './_components/use-owner';

const QUICK_ACTIONS = [
  { href: '/parking-owner/scanner', label: 'Gate scanner', icon: ScanLine },
  { href: '/parking-owner/bookings', label: 'Bookings', icon: ClipboardList },
  { href: '/parking-owner/locations', label: 'My places', icon: MapPinned },
  { href: '/parking-owner/locations/new', label: 'Add place', icon: PlusCircle },
  { href: '/parking-owner/earnings', label: 'Earnings', icon: BarChart3 },
  { href: '/parking-owner/onboarding', label: 'Business & KYC', icon: UserCheck },
];

const rupees = (r: number) => formatRupees(Math.round(r * 100));

export default function OwnerDashboard() {
  const s = useSession();
  const name = s.status === 'authenticated' ? s.user.name.split(' ')[0] : '';
  const profile = useOwnerProfile();
  const dash = useQuery({
    queryKey: ['owner-dashboard'],
    queryFn: () => api<OwnerDashboardDto>('/owner/dashboard'),
    refetchInterval: 30_000,
  });
  const d = dash.data;
  const capacity = d?.locations.reduce((a, l) => a + l.capacity, 0) ?? 0;
  const occupancy = d && capacity ? d.insideNow / capacity : 0;

  return (
    <PageShell
      title={`Hi ${name}`}
      description="Today at your parking places."
      actions={
        <Button variant="gold" className="qp-shine" asChild>
          <Link href="/parking-owner/scanner">
            <ScanLine /> Open scanner
          </Link>
        </Button>
      }
    >
      {profile.data === null && (
        <Alert>
          Welcome! Start by filling in your{' '}
          <Link className="underline" href="/parking-owner/onboarding">
            business details and documents
          </Link>
          . Then add your first place.
        </Alert>
      )}
      {profile.data && profile.data.kycStatus !== 'APPROVED' && (
        <Alert>
          Verification: <StatusPill status={profile.data.kycStatus} />. Places can go live after
          approval.{' '}
          <Link className="underline" href="/parking-owner/onboarding">
            Details
          </Link>
        </Alert>
      )}

      {/* Quick actions as app icons, like a phone home screen. */}
      <section
        aria-label="Quick actions"
        className="surface-3d grid grid-cols-3 gap-x-2 gap-y-3 rounded-3xl border bg-card p-4 sm:grid-cols-6 sm:p-5"
      >
        {QUICK_ACTIONS.map((a, i) => (
          <AppTile
            key={a.href}
            href={a.href}
            label={a.label}
            hue={TILE_HUES[i % TILE_HUES.length]!}
            icon={<a.icon aria-hidden />}
            className="rise-in"
            style={{ '--i': i } as CSSProperties}
          />
        ))}
      </section>

      <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
        {[
          <Kpi
            key="in"
            label="Vehicles inside now"
            value={d?.insideNow ?? '—'}
            hint={d ? `${capacity} slots in total` : undefined}
            progress={d ? occupancy : undefined}
            icon={<Car />}
          />,
          <Kpi
            key="bk"
            label="Bookings today"
            value={d?.todayBookings ?? '—'}
            icon={<CalendarCheck />}
          />,
          <Kpi
            key="rt"
            label="Revenue today"
            value={d ? d.revenueTodayPaise / 100 : '—'}
            format={rupees}
            hint="Online bookings, after refunds"
            icon={<IndianRupee />}
          />,
          <Kpi
            key="rm"
            label="Revenue this month"
            value={d ? d.revenueMonthPaise / 100 : '—'}
            format={rupees}
            icon={<Wallet />}
          />,
        ].map((k, i) => (
          <div key={i} className="rise-in" style={{ '--i': i } as CSSProperties}>
            {k}
          </div>
        ))}
      </div>

      <div className="grid gap-6 lg:grid-cols-[1fr_300px]">
        <Card>
          <CardHeader className="flex-row items-start justify-between">
            <div className="grid gap-1.5">
              <CardTitle className="text-lg">Last 30 days</CardTitle>
              <CardDescription>Revenue and your share, per day.</CardDescription>
            </div>
            <div className="flex gap-4 text-xs text-muted-foreground">
              <span className="flex items-center gap-1.5">
                <span className="size-2.5 rounded-full bg-[oklch(0.45_0.165_248)]" /> Revenue
              </span>
              <span className="flex items-center gap-1.5">
                <span className="size-2.5 rounded-full bg-gold" /> Your share
              </span>
            </div>
          </CardHeader>
          <CardContent className="h-72">
            {d ? (
              <ResponsiveContainer width="100%" height="100%">
                <AreaChart
                  data={d.daily.map((x) => ({
                    ...x,
                    label: x.date.slice(5),
                    gross: x.grossPaise / 100,
                    net: x.netPaise / 100,
                  }))}
                  margin={{ top: 10, right: 6, left: 0, bottom: 0 }}
                >
                  <defs>
                    <linearGradient id="qpGross" x1="0" y1="0" x2="0" y2="1">
                      <stop offset="0%" stopColor="oklch(0.45 0.165 248)" stopOpacity={0.45} />
                      <stop offset="100%" stopColor="oklch(0.45 0.165 248)" stopOpacity={0} />
                    </linearGradient>
                    <linearGradient id="qpNet" x1="0" y1="0" x2="0" y2="1">
                      <stop offset="0%" stopColor="oklch(0.78 0.192 254)" stopOpacity={0.6} />
                      <stop offset="100%" stopColor="oklch(0.78 0.192 254)" stopOpacity={0} />
                    </linearGradient>
                    <filter id="qpGlow" x="-10%" y="-10%" width="120%" height="140%">
                      <feDropShadow
                        dx="0"
                        dy="6"
                        stdDeviation="5"
                        floodColor="oklch(0.62 0.192 254)"
                        floodOpacity="0.45"
                      />
                    </filter>
                  </defs>
                  <CartesianGrid strokeDasharray="3 3" vertical={false} className="stroke-border" />
                  <XAxis
                    dataKey="label"
                    tick={{ fontSize: 11 }}
                    interval={4}
                    axisLine={false}
                    tickLine={false}
                  />
                  <YAxis tick={{ fontSize: 11 }} width={50} axisLine={false} tickLine={false} />
                  <Tooltip
                    contentStyle={{
                      borderRadius: 12,
                      border: '1px solid var(--border)',
                      background: 'var(--card)',
                      boxShadow: '0 20px 40px -16px rgb(0 0 0 / 0.35)',
                    }}
                    formatter={(v: number, n: string) => [
                      `₹${v.toLocaleString('en-IN')}`,
                      n === 'net' ? 'Your share' : 'Revenue',
                    ]}
                  />
                  <Area
                    type="monotone"
                    dataKey="gross"
                    name="gross"
                    stroke="oklch(0.45 0.165 248)"
                    strokeWidth={2}
                    fill="url(#qpGross)"
                  />
                  <Area
                    type="monotone"
                    dataKey="net"
                    name="net"
                    stroke="oklch(0.7 0.208 254)"
                    strokeWidth={3}
                    fill="url(#qpNet)"
                    style={{ filter: 'url(#qpGlow)' }}
                    activeDot={{ r: 6, strokeWidth: 3, stroke: 'var(--card)' }}
                  />
                </AreaChart>
              </ResponsiveContainer>
            ) : (
              <div className="h-full animate-pulse rounded-lg bg-muted" />
            )}
          </CardContent>
        </Card>

        <Card className="flex flex-col items-center justify-center gap-3 py-6 text-center">
          <CardTitle className="text-lg">How full right now</CardTitle>
          <Gauge
            value={occupancy}
            size={168}
            stroke={16}
            sub={d ? `${d.insideNow} of ${capacity} slots` : 'Loading…'}
          />
          <p className="flex items-center gap-2 text-xs text-muted-foreground">
            <span className="qp-live inline-block size-2 rounded-full bg-success" /> Updates every
            30 seconds
          </p>
        </Card>
      </div>

      <section className="grid gap-4">
        <h2 className="text-xl font-bold">Your places</h2>
        {d && !d.locations.length && (
          <Card className="p-6 text-sm text-muted-foreground">
            No places yet.{' '}
            <Link className="underline" href="/parking-owner/locations/new">
              Add your first place
            </Link>
            .
          </Card>
        )}
        <div className="grid gap-4 md:grid-cols-2">
          {d?.locations.map((l, i) => (
            <Tilt key={l.id} max={5} className="rise-in" style={{ '--i': i } as CSSProperties}>
              <Link
                href={`/parking-owner/locations/${l.id}`}
                className="surface-3d group block h-full overflow-hidden rounded-3xl border bg-card"
              >
                {/* The owner's own photo; until they upload one, a stock car-park photo stands in. */}
                <div className="relative h-52 overflow-hidden bg-muted">
                  <img
                    src={l.photoUrl ?? placeholderPhoto(l.id)}
                    alt=""
                    loading="lazy"
                    className="size-full object-cover transition-transform duration-700 group-hover:scale-105"
                  />
                  <span
                    className="absolute inset-0 bg-gradient-to-t from-black/55 via-black/5 to-black/25"
                    aria-hidden
                  />
                  <span className="absolute top-3 left-3 rounded-full bg-white/95 shadow-md">
                    <StatusPill status={l.status} />
                  </span>
                  {!l.photoUrl && (
                    <span className="glass-dark absolute right-3 bottom-3 flex items-center gap-1.5 rounded-full px-2.5 py-1 text-xs font-medium text-white">
                      <Camera className="size-3.5" aria-hidden />
                      Sample photo · add yours
                    </span>
                  )}
                </div>
                <div className="flex items-center justify-between gap-3 p-4">
                  <div className="min-w-0">
                    <p className="truncate font-semibold group-hover:underline">{l.name}</p>
                    <p className="text-sm text-muted-foreground">
                      {l.inside} of {l.capacity} slots occupied
                    </p>
                  </div>
                  <Gauge
                    value={l.capacity ? l.inside / l.capacity : 0}
                    size={64}
                    stroke={7}
                    className="[&_span]:text-sm"
                  />
                </div>
              </Link>
            </Tilt>
          ))}
        </div>
      </section>
    </PageShell>
  );
}

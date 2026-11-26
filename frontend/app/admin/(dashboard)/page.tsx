'use client';

import { useQuery } from '@tanstack/react-query';
import {
  BadgeCheck,
  CalendarCheck,
  IndianRupee,
  MapPin,
  MessageSquareWarning,
  PiggyBank,
  RotateCcw,
} from 'lucide-react';
import Link from 'next/link';
import type { CSSProperties } from 'react';
import { Cell, Pie, PieChart, ResponsiveContainer, Tooltip } from 'recharts';
import { PageShell } from '@/shared/layout/page-shell';
import { api } from '@/shared/lib/api';
import { formatRupees } from '@/shared/lib/format';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/shared/ui/card';
import { Kpi } from '@/shared/ui/kpi';
import { Pillars3D } from '@/shared/ui/pillars';
import { InviteAdminForm } from './_components/invite-admin-form';

interface Overview {
  users: number;
  owners: number;
  activeLocations: number;
  pendingKyc: number;
  pendingLocations: number;
  openDisputes: number;
  failedRefunds: number;
  last30Days: {
    bookings: number;
    grossPaise: number;
    commissionPaise: number;
    refundPaise: number;
  };
}

const rupees = (paise: number) => formatRupees(Math.round(paise));
const SLICES = [
  { key: 'owners', name: 'Paid to owners', color: 'oklch(0.36 0.135 248)' },
  { key: 'commission', name: 'Commission', color: 'oklch(0.78 0.192 254)' },
  { key: 'refunds', name: 'Refunded', color: 'oklch(0.62 0.17 27)' },
] as const;

/** Donut of the last 30 days' takings, raised off the card with a drop shadow so it reads as a 3D disc. */
function MoneyDonut({ d }: { d: Overview['last30Days'] }) {
  const owners = Math.max(0, d.grossPaise - d.commissionPaise - d.refundPaise);
  const values = { owners, commission: d.commissionPaise, refunds: d.refundPaise };
  const data = SLICES.map((s) => ({ ...s, value: values[s.key] / 100 }));
  const empty = data.every((x) => x.value === 0);
  return (
    <div className="grid items-center gap-6 sm:grid-cols-[220px_1fr]">
      <div className="relative mx-auto size-[220px] [filter:drop-shadow(0_14px_14px_oklch(0.2_0.075_248/0.35))]">
        <ResponsiveContainer width="100%" height="100%">
          <PieChart>
            <Pie
              data={empty ? [{ name: 'No takings yet', value: 1, color: 'var(--muted)' }] : data}
              dataKey="value"
              innerRadius={66}
              outerRadius={100}
              paddingAngle={empty ? 0 : 3}
              cornerRadius={6}
              stroke="none"
              isAnimationActive
            >
              {(empty ? [{ color: 'var(--muted)' }] : data).map((x, i) => (
                <Cell key={i} fill={x.color} />
              ))}
            </Pie>
            {!empty && <Tooltip formatter={(v: number) => `₹${v.toLocaleString('en-IN')}`} />}
          </PieChart>
        </ResponsiveContainer>
        <div className="pointer-events-none absolute inset-0 grid place-content-center text-center">
          <span className="text-xs text-muted-foreground">Gross</span>
          <span className="font-serif text-xl font-bold">{rupees(d.grossPaise)}</span>
        </div>
      </div>
      <ul className="grid gap-3">
        {data.map((x) => (
          <li key={x.key} className="flex items-center gap-3">
            <span
              className="size-3.5 rounded-[4px] shadow-[inset_0_1px_0_rgb(255_255_255/0.4),0_2px_0_rgb(0_0_0/0.25)]"
              style={{ background: x.color }}
            />
            <span className="flex-1 text-sm">{x.name}</span>
            <span className="font-semibold tabular-nums">{rupees(x.value * 100)}</span>
          </li>
        ))}
      </ul>
    </div>
  );
}

export default function AdminHome() {
  const o = useQuery({
    queryKey: ['admin-overview'],
    queryFn: () => api<Overview>('/admin/overview'),
  });
  const d = o.data;
  const tiles = [
    <Link key="appr" href="/admin/approvals" className="block h-full">
      <Kpi
        label="Waiting for approval"
        icon={<BadgeCheck />}
        tone={d && d.pendingKyc + d.pendingLocations ? 'alert' : undefined}
        value={d ? d.pendingKyc + d.pendingLocations : '—'}
        hint={d ? `${d.pendingKyc} owners · ${d.pendingLocations} places` : undefined}
      />
    </Link>,
    <Link key="disp" href="/admin/disputes" className="block h-full">
      <Kpi
        label="Open disputes"
        icon={<MessageSquareWarning />}
        tone={d?.openDisputes ? 'alert' : undefined}
        value={d?.openDisputes ?? '—'}
      />
    </Link>,
    !!d?.failedRefunds && (
      <Link key="ref" href="/admin/payments" className="block h-full">
        <Kpi
          label="Refunds that failed"
          icon={<RotateCcw />}
          tone="alert"
          value={d.failedRefunds}
          hint="Retried 6 times. Refund by hand in Razorpay."
        />
      </Link>
    ),
    <Kpi
      key="places"
      label="Live places"
      icon={<MapPin />}
      value={d?.activeLocations ?? '—'}
      hint={d ? `${d.owners} owners · ${d.users} users` : undefined}
    />,
    <Kpi
      key="bk"
      label="Bookings (30 days)"
      icon={<CalendarCheck />}
      value={d?.last30Days.bookings ?? '—'}
    />,
    <Kpi
      key="rev"
      label="Revenue (30 days)"
      icon={<IndianRupee />}
      value={d ? (d.last30Days.grossPaise - d.last30Days.refundPaise) / 100 : '—'}
      format={(n) => rupees(n * 100)}
      hint="After refunds"
    />,
    <Kpi
      key="com"
      label="Commission (30 days)"
      icon={<PiggyBank />}
      value={d ? d.last30Days.commissionPaise / 100 : '—'}
      format={(n) => rupees(n * 100)}
      progress={
        d && d.last30Days.grossPaise
          ? d.last30Days.commissionPaise / d.last30Days.grossPaise
          : undefined
      }
    />,
  ].filter(Boolean);

  return (
    <PageShell title="Dashboard" description="Your platform at a glance.">
      <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
        {tiles.map((t, i) => (
          <div key={i} className="rise-in" style={{ '--i': i } as CSSProperties}>
            {t}
          </div>
        ))}
      </div>

      <div className="grid gap-6 lg:grid-cols-2">
        <Card>
          <CardHeader>
            <CardTitle className="text-lg">Where the money went</CardTitle>
            <CardDescription>Last 30 days of online payments.</CardDescription>
          </CardHeader>
          <CardContent>{d ? <MoneyDonut d={d.last30Days} /> : <Skeleton />}</CardContent>
        </Card>
        <Card className="overflow-hidden">
          <CardHeader>
            <CardTitle className="text-lg">Network</CardTitle>
            <CardDescription>Who is on Quick Park right now.</CardDescription>
          </CardHeader>
          <CardContent className="bg-[linear-gradient(to_top,var(--muted),transparent_60%)]">
            {d ? (
              <Pillars3D
                data={[
                  { label: 'Users', value: d.users },
                  { label: 'Owners', value: d.owners },
                  { label: 'Live places', value: d.activeLocations, tone: 'gold' },
                  { label: 'Bookings · 30d', value: d.last30Days.bookings },
                ]}
              />
            ) : (
              <Skeleton />
            )}
          </CardContent>
        </Card>
      </div>
      <InviteAdminForm />
    </PageShell>
  );
}

function Skeleton() {
  return <div className="h-56 animate-pulse rounded-lg bg-muted" />;
}

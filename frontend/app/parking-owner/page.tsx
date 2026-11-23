'use client';

import type { OwnerDashboardDto } from '@qp/types';
import { useQuery } from '@tanstack/react-query';
import { CalendarCheck, Car, IndianRupee, ScanLine } from 'lucide-react';
import Link from 'next/link';
import { Bar, BarChart, CartesianGrid, ResponsiveContainer, Tooltip, XAxis, YAxis } from 'recharts';
import { PageShell } from '@/shared/layout/page-shell';
import { api } from '@/shared/lib/api';
import { useSession } from '@/shared/lib/auth/use-session';
import { formatRupees } from '@/shared/lib/format';
import { Alert } from '@/shared/ui/alert';
import { StatusPill } from '@/shared/ui/badge';
import { Button } from '@/shared/ui/button';
import { Card, CardContent, CardHeader, CardTitle } from '@/shared/ui/card';
import { Kpi } from '@/shared/ui/kpi';
import { useOwnerProfile } from './_components/use-owner';

export default function OwnerDashboard() {
  const s = useSession();
  const name = s.status === 'authenticated' ? s.user.name.split(' ')[0] : '';
  const profile = useOwnerProfile();
  const dash = useQuery({ queryKey: ['owner-dashboard'], queryFn: () => api<OwnerDashboardDto>('/owner/dashboard'), refetchInterval: 30_000 });
  const d = dash.data;

  return (
    <PageShell title={`Hi ${name}`} description="Today at your parking places.">
      {profile.data === null && (
        <Alert>
          Welcome! Start by filling in your <Link className="underline" href="/parking-owner/onboarding">business details and documents</Link>. Then add your first place.
        </Alert>
      )}
      {profile.data && profile.data.kycStatus !== 'APPROVED' && (
        <Alert>
          Verification: <StatusPill status={profile.data.kycStatus} />. Places can go live after approval. <Link className="underline" href="/parking-owner/onboarding">Details</Link>
        </Alert>
      )}
      <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
        <Kpi label="Vehicles inside now" value={d?.insideNow ?? '—'} icon={<Car />} />
        <Kpi label="Bookings today" value={d?.todayBookings ?? '—'} icon={<CalendarCheck />} />
        <Kpi label="Revenue today" value={d ? formatRupees(d.revenueTodayPaise) : '—'} hint="Online bookings, after refunds" icon={<IndianRupee />} />
        <Kpi label="Revenue this month" value={d ? formatRupees(d.revenueMonthPaise) : '—'} icon={<IndianRupee />} />
      </div>
      <div className="grid gap-6 lg:grid-cols-[1fr_360px]">
        <Card>
          <CardHeader>
            <CardTitle className="text-lg">Last 30 days</CardTitle>
          </CardHeader>
          <CardContent className="h-72">
            {d && (
              <ResponsiveContainer width="100%" height="100%">
                <BarChart data={d.daily.map((x) => ({ ...x, label: x.date.slice(5), gross: x.grossPaise / 100, net: x.netPaise / 100 }))}>
                  <CartesianGrid strokeDasharray="3 3" vertical={false} className="stroke-border" />
                  <XAxis dataKey="label" tick={{ fontSize: 11 }} interval={4} />
                  <YAxis tick={{ fontSize: 11 }} width={50} />
                  <Tooltip formatter={(v: number, n: string) => [`₹${v.toLocaleString('en-IN')}`, n === 'net' ? 'Your share' : 'Revenue']} />
                  <Bar dataKey="gross" name="gross" fill="currentColor" className="text-muted-foreground/40" radius={[3, 3, 0, 0]} />
                  <Bar dataKey="net" name="net" fill="currentColor" className="text-foreground" radius={[3, 3, 0, 0]} />
                </BarChart>
              </ResponsiveContainer>
            )}
          </CardContent>
        </Card>
        <Card>
          <CardHeader className="flex-row items-center justify-between">
            <CardTitle className="text-lg">Places</CardTitle>
            <Button size="sm" asChild>
              <Link href="/parking-owner/scanner">
                <ScanLine /> Scanner
              </Link>
            </Button>
          </CardHeader>
          <CardContent className="grid gap-2">
            {!d?.locations.length && <p className="text-sm text-muted-foreground">No places yet.</p>}
            {d?.locations.map((l) => (
              <Link key={l.id} href={`/parking-owner/locations/${l.id}`} className="grid gap-1 rounded-md border p-3 hover:bg-accent/40">
                <div className="flex items-center justify-between gap-2">
                  <span className="font-medium">{l.name}</span>
                  <StatusPill status={l.status} />
                </div>
                <div className="h-2 overflow-hidden rounded-full bg-muted" aria-hidden>
                  <div className="h-full bg-foreground" style={{ width: `${l.capacity ? Math.min(100, (l.inside / l.capacity) * 100) : 0}%` }} />
                </div>
                <span className="text-xs text-muted-foreground">
                  {l.inside} of {l.capacity} slots occupied
                </span>
              </Link>
            ))}
          </CardContent>
        </Card>
      </div>
    </PageShell>
  );
}

'use client';

import { useQuery } from '@tanstack/react-query';
import { BadgeCheck, CalendarCheck, IndianRupee, MapPin, MessageSquareWarning, PiggyBank, RotateCcw } from 'lucide-react';
import Link from 'next/link';
import { PageShell } from '@/shared/layout/page-shell';
import { api } from '@/shared/lib/api';
import { formatRupees } from '@/shared/lib/format';
import { Kpi } from '@/shared/ui/kpi';
import { InviteAdminForm } from './_components/invite-admin-form';

interface Overview {
  users: number;
  owners: number;
  activeLocations: number;
  pendingKyc: number;
  pendingLocations: number;
  openDisputes: number;
  failedRefunds: number;
  last30Days: { bookings: number; grossPaise: number; commissionPaise: number; refundPaise: number };
}

export default function AdminHome() {
  const o = useQuery({ queryKey: ['admin-overview'], queryFn: () => api<Overview>('/admin/overview') });
  const d = o.data;
  return (
    <PageShell title="Dashboard" description="Your platform at a glance.">
      <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
        <Link href="/admin/approvals"><Kpi label="Waiting for approval" icon={<BadgeCheck />} tone={d && d.pendingKyc + d.pendingLocations ? 'alert' : undefined} value={d ? d.pendingKyc + d.pendingLocations : '—'} hint={d ? `${d.pendingKyc} owners · ${d.pendingLocations} places` : undefined} /></Link>
        <Link href="/admin/disputes"><Kpi label="Open disputes" icon={<MessageSquareWarning />} tone={d?.openDisputes ? 'alert' : undefined} value={d?.openDisputes ?? '—'} /></Link>
        {!!d?.failedRefunds && (
          <Link href="/admin/payments"><Kpi label="Refunds that failed" icon={<RotateCcw />} tone="alert" value={d.failedRefunds} hint="Retried 6 times. Refund by hand in Razorpay." /></Link>
        )}
        <Kpi label="Live places" icon={<MapPin />} value={d?.activeLocations ?? '—'} hint={d ? `${d.owners} owners · ${d.users} users` : undefined} />
        <Kpi label="Bookings (30 days)" icon={<CalendarCheck />} value={d?.last30Days.bookings ?? '—'} />
        <Kpi label="Revenue (30 days)" icon={<IndianRupee />} value={d ? formatRupees(d.last30Days.grossPaise - d.last30Days.refundPaise) : '—'} hint="After refunds" />
        <Kpi label="Commission (30 days)" icon={<PiggyBank />} value={d ? formatRupees(d.last30Days.commissionPaise) : '—'} />
      </div>
      <InviteAdminForm />
    </PageShell>
  );
}

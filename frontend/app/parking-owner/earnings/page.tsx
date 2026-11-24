'use client';

import type { EarningsDto, PayoutDto } from '@qp/types';
import { useQuery } from '@tanstack/react-query';
import { useState } from 'react';
import { PageShell } from '@/shared/layout/page-shell';
import { api } from '@/shared/lib/api';
import { fmtDate, formatRupees } from '@/shared/lib/format';
import { StatusPill } from '@/shared/ui/badge';
import { Card, CardContent, CardHeader, CardTitle } from '@/shared/ui/card';
import { Input } from '@/shared/ui/input';
import { Kpi } from '@/shared/ui/kpi';
import { DataTable } from '@/shared/ui/table';

const firstOfMonth = () => {
  const d = new Date();
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-01`;
};

export default function EarningsPage() {
  const [from, setFrom] = useState(firstOfMonth());
  const [to, setTo] = useState(new Date().toISOString().slice(0, 10));
  const qs = `from=${new Date(`${from}T00:00`).toISOString()}&to=${new Date(`${to}T23:59:59`).toISOString()}`;
  const e = useQuery({
    queryKey: ['earnings', qs],
    queryFn: () => api<EarningsDto>(`/owner/earnings?${qs}`),
  });
  const payouts = useQuery({
    queryKey: ['owner-payouts'],
    queryFn: () => api<PayoutDto[]>('/owner/payouts'),
  });
  const d = e.data;
  return (
    <PageShell
      title="Earnings"
      description="Online bookings are paid to the platform and settled to you minus commission. Walk-in and overstay money you collect at the gate is yours."
    >
      <div className="flex flex-wrap items-end gap-2">
        <label className="grid gap-1 text-sm">
          From
          <Input type="date" value={from} onChange={(x) => setFrom(x.target.value)} />
        </label>
        <label className="grid gap-1 text-sm">
          To
          <Input type="date" value={to} onChange={(x) => setTo(x.target.value)} />
        </label>
      </div>
      <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
        <Kpi label="Booking revenue" value={d ? formatRupees(d.grossPaise) : '—'} />
        <Kpi label="Refunds" value={d ? formatRupees(d.refundPaise) : '—'} />
        <Kpi label="Platform commission" value={d ? formatRupees(d.commissionPaise) : '—'} />
        <Kpi
          label="Your payout share"
          value={d ? formatRupees(d.netPaise) : '—'}
          hint="Revenue − refunds − commission"
        />
        <Kpi label="Walk-ins collected" value={d ? formatRupees(d.walkInPaise) : '—'} />
        <Kpi label="Overstay collected" value={d ? formatRupees(d.overstayPaise) : '—'} />
      </div>
      <Card>
        <CardHeader>
          <CardTitle className="text-lg">By place</CardTitle>
        </CardHeader>
        <CardContent>
          <DataTable
            rows={d?.byLocation ?? []}
            rowKey={(r) => r.locationId}
            empty="No paid bookings in this period."
            columns={[
              { header: 'Place', cell: (r) => r.name },
              { header: 'Bookings', cell: (r) => r.bookings, className: 'text-right' },
              {
                header: 'Revenue',
                cell: (r) => formatRupees(r.grossPaise),
                className: 'text-right tabular-nums',
              },
              {
                header: 'Your share',
                cell: (r) => formatRupees(r.netPaise),
                className: 'text-right tabular-nums',
              },
            ]}
          />
        </CardContent>
      </Card>
      <Card>
        <CardHeader>
          <CardTitle className="text-lg">Payouts</CardTitle>
        </CardHeader>
        <CardContent>
          <DataTable
            rows={payouts.data ?? []}
            rowKey={(p) => p.id}
            empty="No payouts yet."
            columns={[
              {
                header: 'Period',
                cell: (p) => `${fmtDate(p.periodFrom)} – ${fmtDate(p.periodTo)}`,
              },
              {
                header: 'Net',
                cell: (p) => formatRupees(p.netPaise),
                className: 'text-right tabular-nums',
              },
              { header: 'Status', cell: (p) => <StatusPill status={p.status} /> },
              { header: 'Reference', cell: (p) => p.reference ?? '—' },
              { header: 'Paid on', cell: (p) => (p.paidAt ? fmtDate(p.paidAt) : '—') },
            ]}
          />
        </CardContent>
      </Card>
    </PageShell>
  );
}

'use client';

import type { ReportRowDto } from '@qp/types';
import { useQuery } from '@tanstack/react-query';
import { useState } from 'react';
import { Bar, BarChart, CartesianGrid, ResponsiveContainer, Tooltip, XAxis, YAxis } from 'recharts';
import { PageShell } from '@/shared/layout/page-shell';
import { api } from '@/shared/lib/api';
import { formatRupees } from '@/shared/lib/format';
import { Card, CardContent } from '@/shared/ui/card';
import { Input } from '@/shared/ui/input';
import { Kpi } from '@/shared/ui/kpi';
import { DataTable } from '@/shared/ui/table';
import { StickyBar, Tabs } from '@/shared/ui/tabs';

type GroupBy = 'month' | 'city' | 'category';
interface Report {
  rows: ReportRowDto[];
  totals: { bookings: number; grossPaise: number; commissionPaise: number; refundPaise: number };
}

export default function ReportsPage() {
  const [groupBy, setGroupBy] = useState<GroupBy>('month');
  const [from, setFrom] = useState('');
  const [to, setTo] = useState('');
  const qs = new URLSearchParams({
    groupBy,
    ...(from && { from: new Date(`${from}T00:00`).toISOString() }),
    ...(to && { to: new Date(new Date(`${to}T00:00`).getTime() + 86_400_000).toISOString() }),
  }).toString();
  const r = useQuery({
    queryKey: ['admin-report', qs],
    queryFn: () => api<Report>(`/admin/reports?${qs}`),
  });
  const t = r.data?.totals;
  return (
    <PageShell title="Reports" description="Online booking money by payment date.">
      <StickyBar className="flex flex-wrap items-end gap-3">
        <Tabs
          value={groupBy}
          onChange={setGroupBy}
          items={[
            { value: 'month', label: 'By month' },
            { value: 'city', label: 'By city' },
            { value: 'category', label: 'By category' },
          ]}
        />
        <label className="grid gap-1 text-sm">
          From
          <Input type="date" value={from} onChange={(e) => setFrom(e.target.value)} />
        </label>
        <label className="grid gap-1 text-sm">
          To
          <Input type="date" value={to} onChange={(e) => setTo(e.target.value)} />
        </label>
      </StickyBar>
      <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
        <Kpi label="Bookings" value={t?.bookings ?? '—'} />
        <Kpi label="Revenue" value={t ? formatRupees(t.grossPaise) : '—'} />
        <Kpi label="Refunds" value={t ? formatRupees(t.refundPaise) : '—'} />
        <Kpi label="Commission earned" value={t ? formatRupees(t.commissionPaise) : '—'} />
      </div>
      {!!r.data?.rows.length && (
        <Card>
          <CardContent className="h-72 pt-6">
            <ResponsiveContainer width="100%" height="100%">
              <BarChart
                data={r.data.rows.map((x) => ({
                  ...x,
                  revenue: (x.grossPaise - x.refundPaise) / 100,
                  commission: x.commissionPaise / 100,
                }))}
              >
                <CartesianGrid strokeDasharray="3 3" vertical={false} className="stroke-border" />
                <XAxis dataKey="key" tick={{ fontSize: 11 }} />
                <YAxis tick={{ fontSize: 11 }} width={60} />
                <Tooltip
                  formatter={(v: number, n: string) => [
                    `₹${v.toLocaleString('en-IN')}`,
                    n === 'commission' ? 'Commission' : 'Revenue (after refunds)',
                  ]}
                />
                <Bar
                  dataKey="revenue"
                  fill="currentColor"
                  className="text-muted-foreground/50"
                  radius={[3, 3, 0, 0]}
                />
                <Bar
                  dataKey="commission"
                  fill="currentColor"
                  className="text-foreground"
                  radius={[3, 3, 0, 0]}
                />
              </BarChart>
            </ResponsiveContainer>
          </CardContent>
        </Card>
      )}
      <DataTable
        rows={r.data?.rows ?? []}
        rowKey={(x) => x.key}
        empty="No paid bookings in this range."
        columns={[
          {
            header: groupBy === 'month' ? 'Month' : groupBy === 'city' ? 'City' : 'Category',
            cell: (x) => x.key,
          },
          { header: 'Bookings', cell: (x) => x.bookings, className: 'text-right' },
          {
            header: 'Revenue',
            cell: (x) => formatRupees(x.grossPaise),
            className: 'text-right tabular-nums',
          },
          {
            header: 'Refunds',
            cell: (x) => formatRupees(x.refundPaise),
            className: 'text-right tabular-nums',
          },
          {
            header: 'Commission',
            cell: (x) => formatRupees(x.commissionPaise),
            className: 'text-right tabular-nums',
          },
        ]}
      />
    </PageShell>
  );
}

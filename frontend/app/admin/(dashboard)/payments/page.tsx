'use client';

import type { Paginated } from '@qp/types';
import { useQuery } from '@tanstack/react-query';
import { useState } from 'react';
import { PageShell } from '@/shared/layout/page-shell';
import { api } from '@/shared/lib/api';
import { fmtDateTime, formatRupees } from '@/shared/lib/format';
import { StatusPill } from '@/shared/ui/badge';
import { Button } from '@/shared/ui/button';
import { DataTable } from '@/shared/ui/table';

interface P {
  id: string;
  provider: string;
  providerOrderId: string;
  providerPaymentId: string | null;
  amountPaise: number;
  status: string;
  purpose: string;
  paidAt: string | null;
  createdAt: string;
  booking: { code: string; user: { name: string } };
  refunds: {
    id: string;
    amountPaise: number;
    status: string;
    reason: string;
    attempts?: number;
    lastError?: string | null;
  }[];
}

export default function PaymentsPage() {
  const [page, setPage] = useState(1);
  const list = useQuery({
    queryKey: ['admin-payments', page],
    queryFn: () => api<Paginated<P>>(`/admin/payments?page=${page}`),
  });
  const pages = list.data ? Math.max(1, Math.ceil(list.data.total / list.data.pageSize)) : 1;
  return (
    <PageShell
      title="Payments"
      description="Every gateway order and its refunds. Refund from the Bookings page."
    >
      <DataTable
        rows={list.data?.items ?? []}
        rowKey={(p) => p.id}
        columns={[
          {
            header: 'Created',
            cell: (p) => (
              <span className="whitespace-nowrap text-xs">{fmtDateTime(p.createdAt)}</span>
            ),
          },
          {
            header: 'Booking',
            cell: (p) => (
              <span>
                <span className="font-mono text-xs">{p.booking.code}</span>
                <br />
                <span className="text-xs text-muted-foreground">{p.booking.user.name}</span>
              </span>
            ),
          },
          {
            header: 'Gateway',
            cell: (p) => (
              <span className="text-xs">
                <b>{p.provider}</b> · {p.purpose.toLowerCase()}
                <br />
                <span className="font-mono text-muted-foreground">
                  {p.providerPaymentId ?? p.providerOrderId}
                </span>
              </span>
            ),
          },
          {
            header: 'Amount',
            cell: (p) => formatRupees(p.amountPaise),
            className: 'text-right tabular-nums',
          },
          { header: 'Status', cell: (p) => <StatusPill status={p.status} /> },
          {
            header: 'Refunds',
            cell: (p) =>
              p.refunds.length
                ? p.refunds.map((r) => (
                    <div key={r.id} className="text-xs">
                      {formatRupees(r.amountPaise)} <StatusPill status={r.status} /> {r.reason}
                      {r.status === 'FAILED' && r.attempts
                        ? ` · tried ${r.attempts}×${r.lastError ? `: ${r.lastError}` : ''}`
                        : ''}
                    </div>
                  ))
                : '—',
          },
        ]}
      />
      <div className="flex items-center gap-2 text-sm">
        <Button size="sm" variant="outline" disabled={page <= 1} onClick={() => setPage(page - 1)}>
          Previous
        </Button>
        <span>
          Page {page} of {pages}
        </span>
        <Button
          size="sm"
          variant="outline"
          disabled={page >= pages}
          onClick={() => setPage(page + 1)}
        >
          Next
        </Button>
      </div>
    </PageShell>
  );
}

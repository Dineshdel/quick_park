'use client';

import type { LocationStatus, OwnerLocationDto } from '@qp/types';
import { useQuery, useQueryClient } from '@tanstack/react-query';
import Link from 'next/link';
import { useState } from 'react';
import { PageShell } from '@/shared/layout/page-shell';
import { api, errorMessage } from '@/shared/lib/api';
import { Alert } from '@/shared/ui/alert';
import { StatusPill } from '@/shared/ui/badge';
import { Button } from '@/shared/ui/button';
import { ReasonButton } from '@/shared/ui/reason-button';
import { Select } from '@/shared/ui/select';
import { DataTable } from '@/shared/ui/table';
import { formatRupees } from '@/shared/lib/format';
import { ErrorPopup, useConfirm } from '@/shared/ui/confirm-dialog';

type Row = OwnerLocationDto & { businessName: string };

interface SuspendResult {
  cancelled: number;
  refundedPaise: number;
  activeLeft: number;
  placesSuspended?: number;
}

/** " 3 upcoming bookings cancelled, ₹450 refunded. 1 active booking left to settle in Bookings." */
function suspendSummary(r?: Partial<SuspendResult>) {
  if (!r || r.cancelled === undefined) return '';
  const parts = [
    ` ${r.cancelled} upcoming booking${r.cancelled === 1 ? '' : 's'} cancelled, ${formatRupees(r.refundedPaise ?? 0)} refunded.`,
  ];
  if (r.activeLeft)
    parts.push(
      `${r.activeLeft} active booking${r.activeLeft === 1 ? '' : 's'} left to settle in Bookings.`,
    );
  return parts.join(' ');
}

export default function AdminPlacesPage() {
  const ask = useConfirm();
  const qc = useQueryClient();
  const [status, setStatus] = useState<LocationStatus | ''>('');
  const q = useQuery({
    queryKey: ['admin-places', status],
    queryFn: () => api<Row[]>(`/admin/locations${status ? `?status=${status}` : ''}`),
  });
  const [msg, setMsg] = useState<{ ok: boolean; text: string } | null>(null);
  const run = async (fn: () => Promise<unknown>, ok: string) => {
    try {
      const r = (await fn()) as Partial<SuspendResult> | undefined;
      setMsg({ ok: true, text: ok + suspendSummary(r) });
      await qc.invalidateQueries({ queryKey: ['admin-places'] });
    } catch (e) {
      setMsg({ ok: false, text: errorMessage(e) });
    }
  };
  return (
    <PageShell title="Parking places">
      {msg?.ok && <Alert variant="success">{msg.text}</Alert>}
      <ErrorPopup message={msg && !msg.ok ? msg.text : null} onClose={() => setMsg(null)} />
      <Select
        value={status}
        onChange={(e) => setStatus(e.target.value as LocationStatus | '')}
        className="w-48"
        aria-label="Status"
      >
        <option value="">All statuses</option>
        {['DRAFT', 'PENDING', 'ACTIVE', 'SUSPENDED', 'ARCHIVED'].map((s) => (
          <option key={s} value={s}>
            {s.toLowerCase()}
          </option>
        ))}
      </Select>
      <DataTable
        rows={q.data ?? []}
        rowKey={(l) => l.id}
        columns={[
          {
            header: 'Place',
            cell: (l) =>
              l.status === 'ACTIVE' ? (
                <Link className="underline" href={`/p/${l.slug}`}>
                  {l.name}
                </Link>
              ) : (
                l.name
              ),
          },
          { header: 'Owner', cell: (l) => l.businessName },
          { header: 'City', cell: (l) => l.city },
          {
            header: 'Slots',
            cell: (l) => l.capacities.reduce((s, c) => s + c.totalSlots, 0),
            className: 'text-right',
          },
          { header: 'Status', cell: (l) => <StatusPill status={l.status} /> },
          {
            header: '',
            cell: (l) =>
              l.status === 'ACTIVE' ? (
                <ReasonButton
                  label="Suspend"
                  onConfirm={(reason) =>
                    run(
                      () => api(`/admin/locations/${l.id}/suspend`, { body: { reason } }),
                      `${l.name} suspended.`,
                    )
                  }
                />
              ) : l.status === 'SUSPENDED' ? (
                <Button
                  size="sm"
                  variant="outline"
                  onClick={() =>
                    void ask({
                      title: `Reinstate ${l.name}?`,
                      description: 'It goes live again and customers can book it.',
                      confirmLabel: 'Reinstate',
                    }).then((ok) => {
                      if (ok)
                        void run(
                          () => api(`/admin/locations/${l.id}/reinstate`, { method: 'POST' }),
                          `${l.name} reinstated.`,
                        );
                    })
                  }
                >
                  Reinstate
                </Button>
              ) : l.status === 'PENDING' ? (
                <Link className="text-sm underline" href="/admin/approvals">
                  Review
                </Link>
              ) : null,
          },
        ]}
      />
    </PageShell>
  );
}

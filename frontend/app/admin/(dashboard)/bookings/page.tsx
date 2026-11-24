'use client';

import type { BookingStatus, Paginated } from '@qp/types';
import { formatPlate } from '@qp/validation';
import { useQuery, useQueryClient } from '@tanstack/react-query';
import { useState } from 'react';
import { PageShell } from '@/shared/layout/page-shell';
import { api, errorMessage } from '@/shared/lib/api';
import { fmtDateTime, formatRupees, rupeesToPaise, STATUS_LABEL } from '@/shared/lib/format';
import { Alert } from '@/shared/ui/alert';
import { StatusPill } from '@/shared/ui/badge';
import { Button } from '@/shared/ui/button';
import { Input } from '@/shared/ui/input';
import { Select } from '@/shared/ui/select';
import { DataTable } from '@/shared/ui/table';
import { ErrorPopup, useConfirm } from '@/shared/ui/confirm-dialog';

interface B {
  id: string;
  code: string;
  status: BookingStatus;
  startAt: string;
  endAt: string;
  amountPaise: number;
  paidPaise: number;
  refundedPaise: number;
  customerName: string;
  customerEmail: string;
  plateNumber: string;
  location: { name: string; city: string };
}

function RefundForm({ b, onDone }: { b: B; onDone: (msg: string, ok: boolean) => void }) {
  const ask = useConfirm();
  const [open, setOpen] = useState(false);
  const [amount, setAmount] = useState(String((b.paidPaise - b.refundedPaise) / 100));
  const [reason, setReason] = useState('');
  const [busy, setBusy] = useState(false);
  if (b.paidPaise - b.refundedPaise <= 0) return null;
  if (!open)
    return (
      <Button size="sm" variant="outline" onClick={() => setOpen(true)}>
        Refund
      </Button>
    );
  return (
    <form
      className="flex flex-wrap items-center gap-1"
      onSubmit={async (e) => {
        e.preventDefault();
        if (
          !(await ask({
            title: `Refund ₹${amount} for ${b.code}?`,
            description: 'The money goes back to the customer. This cannot be undone.',
            confirmLabel: 'Refund',
            tone: 'danger',
          }))
        )
          return;
        setBusy(true);
        try {
          const r = await api<{ refundedPaise: number }>('/admin/refunds', {
            body: { bookingId: b.id, amountPaise: rupeesToPaise(amount), reason },
          });
          onDone(`Refunded ${formatRupees(r.refundedPaise)} for ${b.code}.`, true);
          setOpen(false);
        } catch (err) {
          onDone(errorMessage(err), false);
        } finally {
          setBusy(false);
        }
      }}
    >
      <Input
        type="number"
        step="0.01"
        min="1"
        value={amount}
        onChange={(e) => setAmount(e.target.value)}
        className="h-8 w-24"
        aria-label="Amount in rupees"
      />
      <Input
        value={reason}
        onChange={(e) => setReason(e.target.value)}
        placeholder="Reason"
        className="h-8 w-36"
        aria-label="Reason"
      />
      <Button size="sm" type="submit" loading={busy} disabled={reason.trim().length < 3}>
        Refund
      </Button>
      <Button size="sm" variant="ghost" type="button" onClick={() => setOpen(false)}>
        Cancel
      </Button>
    </form>
  );
}

export default function AdminBookingsPage() {
  const qc = useQueryClient();
  const [q, setQ] = useState('');
  const [status, setStatus] = useState('');
  const [page, setPage] = useState(1);
  const qs = new URLSearchParams({
    page: String(page),
    ...(q && { q }),
    ...(status && { status }),
  }).toString();
  const list = useQuery({
    queryKey: ['admin-bookings', qs],
    queryFn: () => api<Paginated<B>>(`/admin/bookings?${qs}`),
  });
  const [msg, setMsg] = useState<{ ok: boolean; text: string } | null>(null);
  const pages = list.data ? Math.max(1, Math.ceil(list.data.total / list.data.pageSize)) : 1;
  return (
    <PageShell title="Bookings">
      {msg?.ok && <Alert variant="success">{msg.text}</Alert>}
      <ErrorPopup message={msg && !msg.ok ? msg.text : null} onClose={() => setMsg(null)} />
      <div className="flex flex-wrap gap-2">
        <Input
          value={q}
          onChange={(e) => {
            setQ(e.target.value);
            setPage(1);
          }}
          placeholder="Code, email or plate"
          className="w-64"
          aria-label="Search"
        />
        <Select
          value={status}
          onChange={(e) => {
            setStatus(e.target.value);
            setPage(1);
          }}
          className="w-48"
          aria-label="Status"
        >
          <option value="">All statuses</option>
          {(Object.keys(STATUS_LABEL) as BookingStatus[]).map((s) => (
            <option key={s} value={s}>
              {STATUS_LABEL[s]}
            </option>
          ))}
        </Select>
      </div>
      <DataTable
        rows={list.data?.items ?? []}
        rowKey={(b) => b.id}
        columns={[
          { header: 'Code', cell: (b) => <span className="font-mono text-xs">{b.code}</span> },
          {
            header: 'Customer',
            cell: (b) => (
              <span>
                {b.customerName}
                <br />
                <span className="text-xs text-muted-foreground">{b.customerEmail}</span>
              </span>
            ),
          },
          {
            header: 'Vehicle',
            cell: (b) => <span className="font-mono">{formatPlate(b.plateNumber)}</span>,
          },
          { header: 'Place', cell: (b) => `${b.location.name}, ${b.location.city}` },
          {
            header: 'When',
            cell: (b) => (
              <span className="whitespace-nowrap text-xs">
                {fmtDateTime(b.startAt)}
                <br />
                {fmtDateTime(b.endAt)}
              </span>
            ),
          },
          {
            header: 'Status',
            cell: (b) => <StatusPill status={b.status} label={STATUS_LABEL[b.status]} />,
          },
          {
            header: 'Paid / refunded',
            cell: (b) => (
              <span className="tabular-nums">
                {formatRupees(b.paidPaise)}
                {b.refundedPaise ? ` / ${formatRupees(b.refundedPaise)}` : ''}
              </span>
            ),
          },
          {
            header: '',
            cell: (b) => (
              <RefundForm
                b={b}
                onDone={(text, ok) => {
                  setMsg({ ok, text });
                  void qc.invalidateQueries({ queryKey: ['admin-bookings'] });
                }}
              />
            ),
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

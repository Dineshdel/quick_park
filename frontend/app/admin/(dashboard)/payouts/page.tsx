'use client';

import type { PayoutDto } from '@qp/types';
import { useQuery, useQueryClient } from '@tanstack/react-query';
import { useState } from 'react';
import { PageShell } from '@/shared/layout/page-shell';
import { api, errorMessage } from '@/shared/lib/api';
import { fmtDate, formatRupees } from '@/shared/lib/format';
import { Alert } from '@/shared/ui/alert';
import { StatusPill } from '@/shared/ui/badge';
import { Button } from '@/shared/ui/button';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/shared/ui/card';
import { Input } from '@/shared/ui/input';
import { Select } from '@/shared/ui/select';
import { DataTable } from '@/shared/ui/table';
import { ErrorPopup, useConfirm } from '@/shared/ui/confirm-dialog';

interface OwnerRow {
  id: string;
  businessName: string;
  kycStatus: string;
  commissionPct: number | null;
  upiId: string | null;
  bankAccountNumber: string | null;
  bankIfsc: string | null;
}

function MarkPaid({ p, onDone }: { p: PayoutDto; onDone: (t: string, ok: boolean) => void }) {
  const ask = useConfirm();
  const [ref, setRef] = useState('');
  if (p.status === 'PAID') return null;
  return (
    <form
      className="flex gap-1"
      onSubmit={async (e) => {
        e.preventDefault();
        if (
          !(await ask({
            title: `Mark payout to ${p.businessName} as paid?`,
            description: `Reference: ${ref}. Do this only after the money has been sent.`,
            confirmLabel: 'Mark paid',
          }))
        )
          return;
        try {
          await api(`/admin/payouts/${p.id}/paid`, { body: { reference: ref } });
          onDone(`Payout to ${p.businessName} marked paid.`, true);
        } catch (err) {
          onDone(errorMessage(err), false);
        }
      }}
    >
      <Input
        value={ref}
        onChange={(e) => setRef(e.target.value)}
        placeholder="UTR / reference"
        className="h-8 w-36"
        aria-label="Payment reference"
      />
      <Button size="sm" type="submit" disabled={ref.trim().length < 2}>
        Mark paid
      </Button>
    </form>
  );
}

export default function PayoutsPage() {
  const qc = useQueryClient();
  const owners = useQuery({
    queryKey: ['admin-owners'],
    queryFn: () => api<OwnerRow[]>('/admin/owners'),
  });
  const payouts = useQuery({
    queryKey: ['admin-payouts'],
    queryFn: () => api<PayoutDto[]>('/admin/payouts'),
  });
  const [ownerId, setOwnerId] = useState('');
  const [from, setFrom] = useState('');
  const [to, setTo] = useState(new Date().toISOString().slice(0, 10));
  const [msg, setMsg] = useState<{ ok: boolean; text: string } | null>(null);
  const done = (text: string, ok: boolean) => {
    setMsg({ ok, text });
    void qc.invalidateQueries({ queryKey: ['admin-payouts'] });
  };
  const owner = owners.data?.find((o) => o.id === ownerId);
  return (
    <PageShell
      title="Payouts"
      description="Settle owners' share of online bookings (revenue − refunds − commission) for a period, then record the bank transfer."
    >
      {msg?.ok && <Alert variant="success">{msg.text}</Alert>}
      <ErrorPopup message={msg && !msg.ok ? msg.text : null} onClose={() => setMsg(null)} />
      <Card>
        <CardHeader>
          <CardTitle className="text-lg">New payout</CardTitle>
          {owner && (
            <CardDescription>
              Pay to: {owner.upiId ?? `${owner.bankAccountNumber ?? '—'} · ${owner.bankIfsc ?? ''}`}{' '}
              · commission {owner.commissionPct ?? 'default'}%
            </CardDescription>
          )}
        </CardHeader>
        <CardContent className="flex flex-wrap items-end gap-2">
          <Select
            value={ownerId}
            onChange={(e) => setOwnerId(e.target.value)}
            className="w-64"
            aria-label="Owner"
          >
            <option value="">Choose owner…</option>
            {owners.data
              ?.filter((o) => o.kycStatus === 'APPROVED')
              .map((o) => (
                <option key={o.id} value={o.id}>
                  {o.businessName}
                </option>
              ))}
          </Select>
          <label className="grid gap-1 text-sm">
            From
            <Input type="date" value={from} onChange={(e) => setFrom(e.target.value)} />
          </label>
          <label className="grid gap-1 text-sm">
            To (inclusive)
            <Input type="date" value={to} onChange={(e) => setTo(e.target.value)} />
          </label>
          <Button
            disabled={!ownerId || !from || !to}
            onClick={async () => {
              try {
                const p = await api<PayoutDto>('/admin/payouts', {
                  body: {
                    ownerId,
                    periodFrom: new Date(`${from}T00:00`).toISOString(),
                    periodTo: new Date(
                      new Date(`${to}T00:00`).getTime() + 86_400_000,
                    ).toISOString(),
                  },
                });
                done(`Payout of ${formatRupees(p.netPaise)} created for ${p.businessName}.`, true);
              } catch (e) {
                done(errorMessage(e), false);
              }
            }}
          >
            Calculate &amp; create
          </Button>
        </CardContent>
      </Card>
      <DataTable
        rows={payouts.data ?? []}
        rowKey={(p) => p.id}
        empty="No payouts yet."
        columns={[
          { header: 'Owner', cell: (p) => p.businessName },
          {
            header: 'Period',
            cell: (p) =>
              `${fmtDate(p.periodFrom)} – ${fmtDate(new Date(new Date(p.periodTo).getTime() - 1))}`,
          },
          {
            header: 'Gross',
            cell: (p) => formatRupees(p.grossPaise),
            className: 'text-right tabular-nums',
          },
          {
            header: 'Refunds',
            cell: (p) => formatRupees(p.refundPaise),
            className: 'text-right tabular-nums',
          },
          {
            header: 'Commission',
            cell: (p) => formatRupees(p.commissionPaise),
            className: 'text-right tabular-nums',
          },
          {
            header: 'Net',
            cell: (p) => <b>{formatRupees(p.netPaise)}</b>,
            className: 'text-right tabular-nums',
          },
          {
            header: 'Status',
            cell: (p) => (
              <span>
                <StatusPill status={p.status} />
                {p.reference ? (
                  <span className="ml-1 text-xs text-muted-foreground">{p.reference}</span>
                ) : null}
              </span>
            ),
          },
          { header: '', cell: (p) => <MarkPaid p={p} onDone={done} /> },
        ]}
      />
    </PageShell>
  );
}

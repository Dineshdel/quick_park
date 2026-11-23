'use client';

import type { DisputeDto, DisputeStatus } from '@qp/types';
import { useQuery, useQueryClient } from '@tanstack/react-query';
import { useState } from 'react';
import { PageShell } from '@/shared/layout/page-shell';
import { api, errorMessage } from '@/shared/lib/api';
import { fmtDateTime, formatRupees, rupeesToPaise } from '@/shared/lib/format';
import { Alert } from '@/shared/ui/alert';
import { StatusPill } from '@/shared/ui/badge';
import { Button } from '@/shared/ui/button';
import { Card, CardContent } from '@/shared/ui/card';
import { Input } from '@/shared/ui/input';
import { Textarea } from '@/shared/ui/select';
import { Tabs } from '@/shared/ui/tabs';

function Resolve({ d, onDone }: { d: DisputeDto; onDone: (text: string, ok: boolean) => void }) {
  const [resolution, setResolution] = useState('');
  const [refund, setRefund] = useState('0');
  const [busy, setBusy] = useState(false);
  const send = async (status: 'RESOLVED' | 'REJECTED') => {
    setBusy(true);
    try {
      await api(`/admin/disputes/${d.id}/resolve`, { body: { status, resolution, refundPaise: status === 'RESOLVED' ? rupeesToPaise(refund || 0) : 0 } });
      onDone(`Issue on ${d.bookingCode} ${status.toLowerCase()}.`, true);
    } catch (e) {
      onDone(errorMessage(e), false);
    } finally {
      setBusy(false);
    }
  };
  return (
    <div className="grid gap-2">
      <Textarea value={resolution} onChange={(e) => setResolution(e.target.value)} placeholder="Decision, sent to the customer" aria-label="Resolution" />
      <div className="flex flex-wrap items-center gap-2">
        <label className="flex items-center gap-1 text-sm">Refund ₹<Input type="number" min={0} step="0.01" value={refund} onChange={(e) => setRefund(e.target.value)} className="h-8 w-24" /></label>
        <Button size="sm" loading={busy} disabled={resolution.trim().length < 3} onClick={() => send('RESOLVED')}>Resolve</Button>
        <Button size="sm" variant="outline" disabled={busy || resolution.trim().length < 3} onClick={() => send('REJECTED')}>Reject</Button>
      </div>
    </div>
  );
}

export default function DisputesPage() {
  const qc = useQueryClient();
  const [status, setStatus] = useState<DisputeStatus>('OPEN');
  const list = useQuery({ queryKey: ['admin-disputes', status], queryFn: () => api<DisputeDto[]>(`/admin/disputes?status=${status}`) });
  const [msg, setMsg] = useState<{ ok: boolean; text: string } | null>(null);
  return (
    <PageShell title="Disputes" description="Issues customers raised on their bookings.">
      {msg && <Alert variant={msg.ok ? 'success' : 'destructive'}>{msg.text}</Alert>}
      <Tabs value={status} onChange={setStatus} items={[{ value: 'OPEN', label: 'Open' }, { value: 'RESOLVED', label: 'Resolved' }, { value: 'REJECTED', label: 'Rejected' }]} />
      {list.data?.length === 0 && <p className="text-sm text-muted-foreground">Nothing here.</p>}
      {list.data?.map((d) => (
        <Card key={d.id}>
          <CardContent className="grid gap-3 pt-6 text-sm">
            <div className="flex flex-wrap items-center gap-2">
              <StatusPill status={d.status} />
              <span className="font-mono">{d.bookingCode}</span>
              <span>{d.customerName}</span>
              <span className="text-muted-foreground">{fmtDateTime(d.createdAt)}</span>
            </div>
            <p>{d.reason}</p>
            {d.status === 'OPEN' ? (
              <Resolve d={d} onDone={(text, ok) => { setMsg({ ok, text }); void qc.invalidateQueries({ queryKey: ['admin-disputes'] }); }} />
            ) : (
              <p className="text-muted-foreground">Decision: {d.resolution}{d.refundPaise ? ` · refunded ${formatRupees(d.refundPaise)}` : ''}</p>
            )}
          </CardContent>
        </Card>
      ))}
    </PageShell>
  );
}

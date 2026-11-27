'use client';

import type { GateChargeDto } from '@qp/types';
import { formatPlate } from '@qp/validation';
import { useQuery, useQueryClient } from '@tanstack/react-query';
import { CheckCircle2 } from 'lucide-react';
import Link from 'next/link';
import { useParams } from 'next/navigation';
import { useState } from 'react';
import { PageShell } from '@/shared/layout/page-shell';
import { api, errorMessage } from '@/shared/lib/api';
import { fmtDateTime, formatRupees } from '@/shared/lib/format';
import { Alert } from '@/shared/ui/alert';
import { Button } from '@/shared/ui/button';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/shared/ui/card';
import { ErrorPopup } from '@/shared/ui/confirm-dialog';
import { PaymentPicker } from '../../_components/payment-picker';

/** 97 → "1 h 37 min". */
const fmtDur = (min: number) =>
  min >= 60 ? `${Math.floor(min / 60)} h ${min % 60} min` : `${min} min`;

/**
 * Overstay charge the gate sent to the driver (from the notification bell). Paying it checks the vehicle out:
 * the server closes the session when the payment is confirmed, so we poll until the status is PAID.
 */
export default function PayGateChargePage() {
  const { id } = useParams<{ id: string }>();
  const qc = useQueryClient();
  const [picking, setPicking] = useState(false);
  const [waiting, setWaiting] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const key = ['gate-charge', id];
  const q = useQuery({
    queryKey: key,
    queryFn: () => api<GateChargeDto>(`/payments/gate/${id}`),
    refetchInterval: (query) => (query.state.data?.status === 'PENDING' ? 5000 : false),
  });
  const c = q.data;

  const waitForPaid = async () => {
    setPicking(false);
    setWaiting(true);
    for (let i = 0; i < 20; i++) {
      const r = await api<GateChargeDto>(`/payments/gate/${id}`).catch(() => null);
      if (r && r.status !== 'PENDING') break;
      await new Promise((res) => setTimeout(res, 1500));
    }
    setWaiting(false);
    await qc.invalidateQueries({ queryKey: key });
    void qc.invalidateQueries({ queryKey: ['notifications'] });
  };

  if (q.isPending)
    return (
      <PageShell title="Overstay charge">
        <p className="text-sm text-muted-foreground">Loading…</p>
      </PageShell>
    );
  if (!c)
    return (
      <PageShell title="Overstay charge">
        <Alert variant="destructive">{errorMessage(q.error)}</Alert>
      </PageShell>
    );

  return (
    <PageShell title="Overstay charge" description={`${c.placeName} · booking ${c.bookingCode}`}>
      <ErrorPopup message={error} onClose={() => setError(null)} />
      <Card
        className={`max-w-lg ${c.status === 'PAID' ? 'border-success' : c.status === 'PENDING' ? 'border-amber-500/60' : ''}`}
      >
        <CardHeader>
          <CardTitle className="text-2xl">
            {c.status === 'PAID' ? (
              <span className="flex items-center gap-2 text-success">
                <CheckCircle2 aria-hidden /> Paid {formatRupees(c.amountPaise)}
              </span>
            ) : (
              <>Pay {formatRupees(c.amountPaise)}</>
            )}
          </CardTitle>
          <CardDescription>
            {c.status === 'PAID'
              ? 'You are checked out. You may leave. Thank you!'
              : c.status === 'PENDING'
                ? 'Your vehicle stayed past the booking. Pay to check out; the gate is told as soon as it is paid.'
                : 'This request is no longer active (it was paid at the gate or replaced by a new one).'}
          </CardDescription>
        </CardHeader>
        <CardContent className="grid gap-4">
          <dl className="divide-y rounded-lg border bg-muted/30 px-4 py-1 text-sm">
            {[
              [
                'Vehicle',
                <span key="v" className="font-mono">
                  {formatPlate(c.plateNumber)}
                </span>,
              ],
              ['Place', c.placeName],
              ['Booking', c.bookingCode],
              ['Stayed extra', fmtDur(c.overstayMinutes)],
              ['Requested', fmtDateTime(c.requestedAt)],
              ...(c.paidAt ? [['Paid', fmtDateTime(c.paidAt)] as const] : []),
            ].map(([k, v]) => (
              <div key={String(k)} className="flex items-baseline justify-between gap-4 py-1.5">
                <dt className="text-muted-foreground">{k}</dt>
                <dd className="font-medium">{v}</dd>
              </div>
            ))}
            <div className="flex items-baseline justify-between gap-4 py-1.5">
              <dt className="text-muted-foreground">Amount</dt>
              <dd className="text-base font-semibold">{formatRupees(c.amountPaise)}</dd>
            </div>
          </dl>

          {c.status === 'PENDING' &&
            c.order &&
            (waiting ? (
              <Alert>Confirming your payment…</Alert>
            ) : (
              <>
                <Button size="lg" onClick={() => setPicking(true)}>
                  Pay {formatRupees(c.amountPaise)} now
                </Button>
                <PaymentPicker
                  order={picking ? c.order : null}
                  description={`Overstay charge · ${c.bookingCode}`}
                  onClose={() => setPicking(false)}
                  onPaid={() => void waitForPaid()}
                />
              </>
            ))}

          <Button variant="ghost" asChild>
            <Link href="/vehicle-owner/bookings">My bookings</Link>
          </Button>
        </CardContent>
      </Card>
    </PageShell>
  );
}

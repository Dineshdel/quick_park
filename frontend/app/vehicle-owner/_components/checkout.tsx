'use client';

import type { PaymentOrderDto } from '@qp/types';
import { useState } from 'react';
import { api, errorMessage } from '@/shared/lib/api';
import { formatRupees } from '@/shared/lib/format';
import { Alert } from '@/shared/ui/alert';
import { Button } from '@/shared/ui/button';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/shared/ui/card';
import { ErrorPopup, useConfirm } from '@/shared/ui/confirm-dialog';

declare global {
  interface Window {
    Razorpay?: new (opts: Record<string, unknown>) => {
      open: () => void;
      on: (e: string, cb: () => void) => void;
    };
  }
}

export function loadRazorpay(): Promise<void> {
  if (window.Razorpay) return Promise.resolve();
  return new Promise((resolve, reject) => {
    const s = document.createElement('script');
    s.src = 'https://checkout.razorpay.com/v1/checkout.js';
    s.onload = () => resolve();
    s.onerror = () => reject(new Error('Could not load the payment window'));
    document.body.appendChild(s);
  });
}

/**
 * Pays a held booking. Razorpay: opens Checkout; the booking is confirmed by the server webhook, so afterwards we
 * poll the booking. Mock (development): shows buttons that simulate success or failure.
 */
export function Checkout({
  bookingId,
  amountPaise,
  holdExpiresAt,
  onDone,
}: {
  bookingId: string;
  amountPaise: number;
  holdExpiresAt: string | null;
  onDone: () => void;
}) {
  const ask = useConfirm();
  const [order, setOrder] = useState<PaymentOrderDto | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const [waiting, setWaiting] = useState(false);

  const waitForConfirmation = async () => {
    setWaiting(true);
    for (let i = 0; i < 20; i++) {
      const b = await api<{ status: string }>(`/bookings/${bookingId}`).catch(() => null);
      if (b && b.status !== 'PENDING_PAYMENT') break;
      await new Promise((r) => setTimeout(r, 1500));
    }
    setWaiting(false);
    onDone();
  };

  const start = async () => {
    if (
      !(await ask({
        title: `Pay ${formatRupees(amountPaise)}?`,
        description: 'The payment window opens next.',
        confirmLabel: 'Pay now',
      }))
    )
      return;
    setBusy(true);
    setError(null);
    try {
      const o = await api<PaymentOrderDto>('/payments/order', { body: { bookingId } });
      setOrder(o);
      if (o.provider === 'razorpay') {
        await loadRazorpay();
        const rz = new window.Razorpay!({
          key: o.keyId,
          order_id: o.orderId,
          amount: o.amountPaise,
          currency: 'INR',
          name: 'Quick Park',
          description: 'Parking booking',
          handler: () => void waitForConfirmation(),
          modal: { ondismiss: () => setBusy(false) },
        });
        rz.on('payment.failed', () => setError('Payment failed. You can try again.'));
        rz.open();
      }
    } catch (e) {
      setError(errorMessage(e));
    } finally {
      setBusy(false);
    }
  };

  const mockPay = async (outcome: 'success' | 'failure') => {
    if (!order) return;
    setBusy(true);
    setError(null);
    try {
      await api('/payments/mock/pay', { body: { orderId: order.orderId, outcome } });
      if (outcome === 'failure') setError('Payment failed (simulated). Try again.');
      else await waitForConfirmation();
    } catch (e) {
      setError(errorMessage(e));
    } finally {
      setBusy(false);
    }
  };

  return (
    <Card className="border-amber-500/40">
      <CardHeader>
        <CardTitle className="text-lg">Pay {formatRupees(amountPaise)} to confirm</CardTitle>
        <CardDescription>
          Your slot is held
          {holdExpiresAt
            ? ` until ${new Date(holdExpiresAt).toLocaleTimeString('en-IN', { timeStyle: 'short' })}`
            : ''}
          . Unpaid holds are released automatically.
        </CardDescription>
      </CardHeader>
      <CardContent className="grid gap-3">
        <ErrorPopup message={error} onClose={() => setError(null)} />
        {waiting ? (
          <Alert>Confirming your payment…</Alert>
        ) : order?.provider === 'mock' ? (
          <div className="grid gap-2">
            <Alert>Test mode: no real money moves. Choose the payment result.</Alert>
            <div className="flex flex-wrap gap-2">
              <Button loading={busy} onClick={() => mockPay('success')}>
                Simulate successful payment
              </Button>
              <Button variant="outline" disabled={busy} onClick={() => mockPay('failure')}>
                Simulate failure
              </Button>
            </div>
          </div>
        ) : (
          <Button size="lg" loading={busy} onClick={start}>
            Pay now
          </Button>
        )}
      </CardContent>
    </Card>
  );
}

'use client';

import type { PaymentOrderDto } from '@qp/types';
import { razorpayMethodOptions, type PaymentChoice } from '@qp/validation';
import { useState } from 'react';
import { api, errorMessage } from '@/shared/lib/api';
import { formatRupees } from '@/shared/lib/format';
import { Alert } from '@/shared/ui/alert';
import { Button } from '@/shared/ui/button';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/shared/ui/card';
import { ErrorPopup } from '@/shared/ui/confirm-dialog';
import { PaymentPicker } from './payment-picker';

declare global {
  interface Window {
    Razorpay?: new (opts: Record<string, unknown>) => {
      open: () => void;
      on: (e: string, cb: (r: { error?: { description?: string } }) => void) => void;
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

interface RazorpaySuccess {
  razorpay_payment_id: string;
  razorpay_order_id: string;
  razorpay_signature: string;
}

/**
 * Opens Razorpay Checkout for an order. On success the signed result is sent to the API, which checks it with
 * Razorpay and confirms at once (the webhook is the backup). `onPaid` runs after that, even if the verify call
 * fails: the caller polls, and the webhook or the server's reconciliation still confirms the payment.
 */
export async function payWithRazorpay(
  o: PaymentOrderDto,
  description: string,
  cb: {
    /** Opens Checkout straight on this method (UPI app, UPI ID, card…); omitted = all methods. */
    choice?: PaymentChoice;
    onPaid: () => void;
    onFailed: (reason: string) => void;
    onDismiss: () => void;
  },
) {
  await loadRazorpay();
  const m = cb.choice ? razorpayMethodOptions(cb.choice) : null;
  const rz = new window.Razorpay!({
    key: o.keyId,
    order_id: o.orderId,
    amount: o.amountPaise,
    currency: 'INR',
    name: 'Quick Park',
    description,
    prefill: {
      ...(o.prefill && {
        name: o.prefill.name,
        email: o.prefill.email,
        contact: o.prefill.contact ?? undefined,
      }),
      ...m?.prefill,
    },
    ...(m && { config: m.config }),
    theme: { color: '#1f2a5c' },
    handler: (r: RazorpaySuccess) => {
      void api('/payments/verify', {
        body: {
          orderId: r.razorpay_order_id,
          paymentId: r.razorpay_payment_id,
          signature: r.razorpay_signature,
        },
      })
        .catch(() => null)
        .finally(cb.onPaid);
    },
    modal: { ondismiss: cb.onDismiss },
  });
  rz.on('payment.failed', (r) =>
    cb.onFailed(r?.error?.description ?? 'Payment failed. You can try again.'),
  );
  rz.open();
}

/**
 * Pays a held booking: "Pay now" creates the order and opens the payment picker (UPI apps, UPI ID, card,
 * net banking, QR). The server confirms the booking, so afterwards we poll it.
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
  const [order, setOrder] = useState<PaymentOrderDto | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const [waiting, setWaiting] = useState(false);

  const waitForConfirmation = async () => {
    setOrder(null);
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
    setBusy(true);
    setError(null);
    try {
      setOrder(await api<PaymentOrderDto>('/payments/order', { body: { bookingId } }));
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
        <PaymentPicker
          order={order}
          description="Parking booking"
          onClose={() => setOrder(null)}
          onPaid={() => void waitForConfirmation()}
        />
        {waiting ? (
          <Alert>Confirming your payment…</Alert>
        ) : (
          <>
            <Button size="lg" loading={busy} onClick={start}>
              Pay now
            </Button>
            <p className="text-center text-xs text-muted-foreground">
              UPI (Google Pay, PhonePe, Paytm…) · Debit / credit card · Net banking
            </p>
          </>
        )}
      </CardContent>
    </Card>
  );
}

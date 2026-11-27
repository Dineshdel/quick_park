'use client';

import type { PaymentOrderDto } from '@qp/types';
import {
  BRAND_LOGOS,
  CARD_LOGOS,
  paymentChoiceLabel,
  UPI_APPS,
  upiIdSchema,
  type BrandLogo,
  type PaymentChoice,
} from '@qp/validation';
import {
  AtSign,
  Building2,
  ChevronRight,
  CreditCard,
  FlaskConical,
  Lock,
  QrCode,
  Send,
  Smartphone,
  X,
} from 'lucide-react';
import { useEffect, useRef, useState, type ReactNode } from 'react';
import { api, errorMessage } from '@/shared/lib/api';
import { formatRupees } from '@/shared/lib/format';
import { cn } from '@/shared/lib/utils';
import { Alert } from '@/shared/ui/alert';
import { Button } from '@/shared/ui/button';
import { Input } from '@/shared/ui/input';
import { payWithRazorpay } from './checkout';

/** UPI app links only open on a phone; on a laptop the customer uses a UPI ID (request on their phone) or QR. */
function isPhone() {
  return (
    typeof window !== 'undefined' &&
    (/Android|iPhone|iPad|iPod/i.test(navigator.userAgent) ||
      window.matchMedia('(pointer: coarse)').matches)
  );
}

/**
 * "How would you like to pay?" Lists UPI apps (on phones), UPI ID (collect request to the customer's UPI app),
 * debit / credit card, net banking and QR. Razorpay Checkout then opens locked to the chosen method; card numbers
 * are typed into Razorpay's secure form only. In mock mode the choice leads to simulate buttons instead.
 * Rendered while `order` is set; `onPaid` runs once the payment went through (the caller polls for confirmation).
 */
export function PaymentPicker({
  order,
  description,
  onClose,
  onPaid,
}: {
  order: PaymentOrderDto | null;
  description: string;
  onClose: () => void;
  onPaid: () => void;
}) {
  const dialog = useRef<HTMLDialogElement>(null);
  const [mock, setMock] = useState<PaymentChoice | null>(null);
  const [inCheckout, setInCheckout] = useState(false);
  const [vpa, setVpa] = useState('');
  const [vpaOpen, setVpaOpen] = useState(false);
  const [vpaError, setVpaError] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const [phone, setPhone] = useState(false);
  useEffect(() => setPhone(isPhone()), []);

  // The <dialog> sits in the browser's top layer, above Razorpay's window, so it closes while Checkout is open.
  const visible = !!order && !inCheckout;
  useEffect(() => {
    const d = dialog.current;
    if (!d) return;
    if (visible && !d.open) d.showModal();
    if (!visible && d.open) d.close();
  }, [visible]);
  useEffect(() => {
    if (!order) {
      setMock(null);
      setError(null);
      setVpaOpen(false);
    }
  }, [order]);

  if (!order) return <dialog ref={dialog} className="hidden" />;

  const choose = async (choice: PaymentChoice) => {
    setError(null);
    if (order.provider === 'mock') return setMock(choice);
    setInCheckout(true);
    try {
      await payWithRazorpay(order, description, {
        choice,
        onPaid: () => {
          setInCheckout(false);
          onPaid();
        },
        onFailed: (reason) => setError(reason),
        onDismiss: () => setInCheckout(false),
      });
    } catch (e) {
      setError(errorMessage(e));
      setInCheckout(false);
    }
  };

  const sendVpa = () => {
    const r = upiIdSchema.safeParse(vpa);
    if (!r.success) return setVpaError(r.error.issues[0]?.message ?? 'Invalid UPI ID');
    setVpaError(null);
    void choose({ kind: 'upi_id', vpa: r.data });
  };

  const simulate = async (outcome: 'success' | 'failure') => {
    setBusy(true);
    setError(null);
    try {
      await api('/payments/mock/pay', { body: { orderId: order.orderId, outcome } });
      if (outcome === 'failure') {
        setError('Payment failed (simulated). Try again or choose another method.');
        setMock(null);
      } else onPaid();
    } catch (e) {
      setError(errorMessage(e));
    } finally {
      setBusy(false);
    }
  };

  const apps = (
    <section className="grid gap-3">
      <SectionTitle>Pay by UPI app</SectionTitle>
      <div className="grid grid-cols-3 gap-2.5">
        {UPI_APPS.map((a) => (
          <button
            key={a.code}
            type="button"
            onClick={() => void choose({ kind: 'upi_app', app: a.code })}
            className="group grid justify-items-center gap-2 rounded-2xl border bg-card px-2 py-3.5 shadow-xs transition hover:-translate-y-0.5 hover:border-primary hover:shadow-md focus-visible:outline-none focus-visible:ring-[3px] focus-visible:ring-ring/50"
          >
            <Monogram code={a.code} />
            <span className="truncate text-xs font-semibold">{a.name}</span>
          </button>
        ))}
      </div>
    </section>
  );

  const vpaBlock = (
    <div className="grid gap-2">
      <MethodRow
        icon={<AtSign className="size-5" />}
        title="Pay with UPI ID"
        subtitle={
          phone
            ? 'Get a payment request in your UPI app'
            : 'A request appears on your phone; approve it there'
        }
        active={vpaOpen}
        onClick={() => setVpaOpen((v) => !v)}
      />
      {vpaOpen && (
        <form
          className="grid gap-2 rounded-2xl border bg-muted/30 p-3"
          onSubmit={(e) => {
            e.preventDefault();
            sendVpa();
          }}
        >
          <Input
            autoFocus
            value={vpa}
            onChange={(e) => {
              setVpa(e.target.value);
              setVpaError(null);
            }}
            placeholder="yourname@okaxis"
            autoCapitalize="none"
            autoCorrect="off"
            spellCheck={false}
            inputMode="email"
            aria-invalid={!!vpaError}
            aria-label="UPI ID"
          />
          <p className={cn('text-xs', vpaError ? 'text-destructive' : 'text-muted-foreground')}>
            {vpaError ??
              `A request for ${formatRupees(order.amountPaise)} is sent to this UPI ID. Approve it in your UPI app within 5 minutes.`}
          </p>
          <Button type="submit">
            <Send className="size-4" aria-hidden /> Send payment request
          </Button>
        </form>
      )}
    </div>
  );

  return (
    <dialog
      ref={dialog}
      aria-labelledby="pay-title"
      onCancel={(e) => {
        e.preventDefault();
        if (!busy) onClose();
      }}
      onClick={(e) => e.target === e.currentTarget && !busy && onClose()}
      className="m-auto max-h-[calc(100dvh-2rem)] w-[calc(100%-2rem)] max-w-lg overflow-hidden rounded-3xl border bg-background p-0 text-foreground shadow-2xl backdrop:bg-black/55 backdrop:backdrop-blur-sm"
    >
      <div className="flex max-h-[calc(100dvh-2rem)] flex-col">
        {/* Amount header */}
        <header className="relative overflow-hidden bg-primary px-6 pt-5 pb-6 text-primary-foreground">
          <div
            aria-hidden
            className="pointer-events-none absolute -top-12 -right-12 size-44 rounded-full border-[28px] border-amber-400/20"
          />
          <div className="flex items-start justify-between gap-4">
            <p className="text-[11px] font-bold tracking-[0.14em] uppercase opacity-70">
              Amount to pay
            </p>
            <button
              type="button"
              onClick={onClose}
              disabled={busy}
              aria-label="Close"
              className="-mt-1 -mr-2 grid size-8 place-items-center rounded-full bg-white/10 transition hover:bg-white/20"
            >
              <X className="size-4" />
            </button>
          </div>
          <h2 id="pay-title" className="mt-1 text-4xl font-extrabold tracking-tight">
            {formatRupees(order.amountPaise)}
          </h2>
          <p className="mt-1 text-sm opacity-85">{description}</p>
        </header>

        <div className="grid gap-5 overflow-y-auto p-5">
          {error && <Alert variant="destructive">{error}</Alert>}

          {mock ? (
            <div className="grid justify-items-center gap-3 py-2 text-center">
              {mock.kind === 'upi_app' ? (
                <Monogram code={mock.app} large />
              ) : (
                <span className="grid size-16 place-items-center rounded-full bg-primary/10 text-primary">
                  <MethodIcon choice={mock} />
                </span>
              )}
              <h3 className="text-lg font-bold">{mockTitle(mock)}</h3>
              <p className="max-w-sm text-sm text-muted-foreground">{mockText(mock)}</p>
              <Alert className="text-left">
                <FlaskConical className="size-4" aria-hidden /> Test mode: no real money moves.
                Choose the result.
              </Alert>
              <div className="grid w-full gap-2">
                <Button size="lg" loading={busy} onClick={() => void simulate('success')}>
                  Simulate successful payment
                </Button>
                <Button variant="outline" disabled={busy} onClick={() => void simulate('failure')}>
                  Simulate failure
                </Button>
                <Button variant="ghost" disabled={busy} onClick={() => setMock(null)}>
                  Choose another method
                </Button>
              </div>
            </div>
          ) : (
            <>
              {phone && apps}
              <section className="grid gap-2.5">
                <SectionTitle>
                  {phone ? 'Other ways to pay' : 'How would you like to pay?'}
                </SectionTitle>
                {vpaBlock}
                {!phone && (
                  <MethodRow
                    icon={<QrCode className="size-5" />}
                    title="Scan a UPI QR code"
                    subtitle="Open any UPI app on your phone and scan"
                    onClick={() => void choose({ kind: 'upi_qr' })}
                  />
                )}
                <MethodRow
                  icon={<CreditCard className="size-5" />}
                  title="Debit / credit card"
                  subtitle="Visa · Mastercard · RuPay · Amex"
                  onClick={() => void choose({ kind: 'card' })}
                  trailing={
                    <span className="flex shrink-0 gap-1">
                      {CARD_LOGOS.map((l) => (
                        <span
                          key={l}
                          className="grid h-6 w-9 place-items-center rounded-md border border-black/10 bg-white"
                        >
                          <BrandSvg logo={l} className="size-4.5" />
                        </span>
                      ))}
                    </span>
                  }
                />
                <MethodRow
                  icon={<Building2 className="size-5" />}
                  title="Net banking"
                  subtitle="All major Indian banks"
                  onClick={() => void choose({ kind: 'netbanking' })}
                />
                {phone && (
                  <MethodRow
                    icon={<QrCode className="size-5" />}
                    title="Scan a UPI QR code"
                    subtitle="Pay from another phone"
                    onClick={() => void choose({ kind: 'upi_qr' })}
                  />
                )}
              </section>
              {!phone && (
                <details className="group rounded-2xl border px-4 py-3 text-sm">
                  <summary className="flex cursor-pointer list-none items-center gap-2 font-semibold">
                    <Smartphone className="size-4 text-muted-foreground" aria-hidden />
                    Pay with Google Pay, PhonePe, Paytm…
                    <ChevronRight
                      className="ml-auto size-4 transition group-open:rotate-90"
                      aria-hidden
                    />
                  </summary>
                  <p className="mt-2 text-muted-foreground">
                    On a computer, use <b>UPI ID</b> (the request appears in that app on your phone)
                    or <b>scan the QR code</b> with it. On your phone, the apps open directly.
                  </p>
                </details>
              )}
            </>
          )}

          <p className="flex items-center justify-center gap-1.5 text-xs text-muted-foreground">
            <Lock className="size-3.5 text-success" aria-hidden /> Secured by Razorpay · card
            details never reach Quick Park
          </p>
        </div>
      </div>
    </dialog>
  );
}

function SectionTitle({ children }: { children: ReactNode }) {
  return (
    <h3 className="text-[11px] font-bold tracking-[0.14em] text-muted-foreground uppercase">
      {children}
    </h3>
  );
}

function MethodRow({
  icon,
  title,
  subtitle,
  onClick,
  active,
  trailing,
}: {
  icon: ReactNode;
  title: string;
  subtitle: string;
  onClick: () => void;
  active?: boolean;
  /** Shown before the chevron (card network logos). */
  trailing?: ReactNode;
}) {
  return (
    <button
      type="button"
      onClick={onClick}
      aria-expanded={active}
      className={cn(
        'flex w-full items-center gap-3.5 rounded-2xl border bg-card px-4 py-3 text-left shadow-xs transition hover:border-primary hover:shadow-md focus-visible:outline-none focus-visible:ring-[3px] focus-visible:ring-ring/50',
        active && 'border-primary bg-primary/5',
      )}
    >
      <span className="grid size-10 shrink-0 place-items-center rounded-full bg-primary/10 text-primary">
        {icon}
      </span>
      <span className="grid min-w-0 flex-1 gap-0.5">
        <span className="text-sm font-semibold">{title}</span>
        <span className="truncate text-xs text-muted-foreground">{subtitle}</span>
      </span>
      {trailing}
      <ChevronRight
        className={cn('size-4 text-muted-foreground transition', active && 'rotate-90')}
        aria-hidden
      />
    </button>
  );
}

/** A real brand logo (24×24 path) in its own colour. */
function BrandSvg({ logo, className }: { logo: BrandLogo; className?: string }) {
  const b = BRAND_LOGOS[logo];
  return (
    <svg viewBox="0 0 24 24" role="img" aria-label={b.name} className={className}>
      <path d={b.path} fill={b.color} />
    </svg>
  );
}

/** The app's logo on a white tile (white in dark mode too, so brand colours read), or a coloured letter. */
function Monogram({ code, large }: { code: string; large?: boolean }) {
  const app = UPI_APPS.find((a) => a.code === code)!;
  if (app.logo)
    return (
      <span
        className={cn(
          'grid place-items-center border border-black/10 bg-white shadow-sm',
          large ? 'size-16 rounded-2xl' : 'size-11 rounded-xl',
        )}
      >
        <BrandSvg logo={app.logo} className={large ? 'size-9' : 'size-6'} />
      </span>
    );
  return (
    <span
      aria-hidden
      style={{ backgroundColor: app.color }}
      className={cn(
        'grid place-items-center font-extrabold text-white shadow-sm',
        large ? 'size-16 rounded-2xl text-2xl' : 'size-11 rounded-xl text-base',
      )}
    >
      {app.short}
    </span>
  );
}

function MethodIcon({ choice }: { choice: PaymentChoice }) {
  const Icon =
    choice.kind === 'card'
      ? CreditCard
      : choice.kind === 'netbanking'
        ? Building2
        : choice.kind === 'upi_qr'
          ? QrCode
          : AtSign;
  return <Icon className="size-7" aria-hidden />;
}

const mockTitle = (c: PaymentChoice) =>
  c.kind === 'upi_app'
    ? `Opening ${paymentChoiceLabel(c)}…`
    : c.kind === 'upi_id'
      ? `Request sent to ${c.vpa}`
      : `Pay by ${paymentChoiceLabel(c).toLowerCase()}`;

const mockText = (c: PaymentChoice) =>
  c.kind === 'upi_app'
    ? 'With live payments the app opens and you approve the payment with your UPI PIN.'
    : c.kind === 'upi_id'
      ? 'With live payments a notification arrives in the UPI app linked to this ID (on your phone). Approve it with your UPI PIN.'
      : c.kind === 'card'
        ? "With live payments Razorpay's secure card form opens (debit or credit, with OTP)."
        : c.kind === 'netbanking'
          ? 'With live payments you pick your bank and sign in on its secure page.'
          : 'With live payments a QR code appears; scan it from any UPI app.';

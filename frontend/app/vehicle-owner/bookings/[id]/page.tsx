'use client';

import type { BookingDto, PassDto } from '@qp/types';
import { formatPlate, refundPctFor } from '@qp/validation';
import { useQuery, useQueryClient } from '@tanstack/react-query';
import { Download, RotateCcw } from 'lucide-react';
import Link from 'next/link';
import { useParams, useRouter } from 'next/navigation';
import { useState } from 'react';
import { api, errorMessage, openBlob } from '@/shared/lib/api';
import { fmtDateTime, formatRupees, planLabel, planUnit, STATUS_LABEL } from '@/shared/lib/format';
import { Alert } from '@/shared/ui/alert';
import { StatusPill } from '@/shared/ui/badge';
import { Button } from '@/shared/ui/button';
import { Card, CardContent, CardHeader, CardTitle } from '@/shared/ui/card';
import { Input } from '@/shared/ui/input';
import { Textarea } from '@/shared/ui/select';
import { Checkout } from '../../_components/checkout';
import { ErrorPopup, useConfirm } from '@/shared/ui/confirm-dialog';

interface DisputeRow {
  id: string;
  reason: string;
  status: string;
  resolution: string | null;
  refundPaise: number;
  createdAt: string;
}

export default function BookingDetailPage() {
  const ask = useConfirm();
  const { id } = useParams<{ id: string }>();
  const router = useRouter();
  const qc = useQueryClient();
  const booking = useQuery({
    queryKey: ['booking', id],
    queryFn: () => api<BookingDto>(`/bookings/${id}`),
  });
  const b = booking.data;
  const hasPass = b && (b.status === 'CONFIRMED' || b.status === 'ACTIVE');
  const pass = useQuery({
    queryKey: ['pass', id],
    queryFn: () => api<PassDto>(`/bookings/${id}/pass`),
    enabled: !!hasPass,
  });
  const disputes = useQuery({
    queryKey: ['disputes', id],
    queryFn: () => api<DisputeRow[]>(`/bookings/${id}/disputes`),
    enabled: !!b && b.status !== 'PENDING_PAYMENT',
  });
  const [msg, setMsg] = useState<{ ok: boolean; text: string } | null>(null);
  const [busy, setBusy] = useState<string | null>(null);
  const [extendQty, setExtendQty] = useState(1);
  const [issue, setIssue] = useState('');

  const refresh = () => {
    void qc.invalidateQueries({ queryKey: ['booking', id] });
    void qc.invalidateQueries({ queryKey: ['pass', id] });
    void qc.invalidateQueries({ queryKey: ['disputes', id] });
    void qc.invalidateQueries({ queryKey: ['bookings'] });
  };
  const run = async (key: string, fn: () => Promise<unknown>, ok: string) => {
    setBusy(key);
    setMsg(null);
    try {
      await fn();
      setMsg({ ok: true, text: ok });
      refresh();
    } catch (e) {
      setMsg({ ok: false, text: errorMessage(e) });
    } finally {
      setBusy(null);
    }
  };

  if (booking.isPending)
    return (
      <div className="mx-auto max-w-4xl px-4 py-8 text-sm text-muted-foreground">Loading…</div>
    );
  if (booking.isError || !b)
    return (
      <div className="mx-auto max-w-4xl px-4 py-8">
        <Alert variant="destructive">Booking not found.</Alert>
      </div>
    );

  const hoursLeft = (new Date(b.startAt).getTime() - Date.now()) / 3_600_000;
  const refundPct = refundPctFor(b.cancellationRules, hoursLeft);
  const canCancel = b.status === 'PENDING_PAYMENT' || (b.status === 'CONFIRMED' && hoursLeft > 0);
  const canExtend =
    (b.status === 'CONFIRMED' || b.status === 'ACTIVE') &&
    b.planType !== 'EVENT' &&
    new Date(b.endAt) > new Date();

  return (
    <div className="mx-auto grid max-w-4xl gap-6 px-4 py-8">
      <div className="flex flex-wrap items-center gap-3">
        <h1 className="text-2xl font-semibold tracking-tight">{b.location.name}</h1>
        <StatusPill status={b.status} label={STATUS_LABEL[b.status]} />
        <span className="font-mono text-sm text-muted-foreground">{b.code}</span>
      </div>
      {msg?.ok && <Alert variant="success">{msg.text}</Alert>}
      <ErrorPopup message={msg && !msg.ok ? msg.text : null} onClose={() => setMsg(null)} />
      {b.checkInBy && (
        <Alert className="border-amber-500/50 bg-amber-500/10">
          <b>Check in by {fmtDateTime(b.checkInBy)}.</b> If your vehicle hasn&apos;t entered by
          then, the booking is released as a no-show and the slot goes to someone else (no refund).
        </Alert>
      )}
      {b.status === 'EXPIRED' && b.cancelReason && (
        <Alert variant="destructive">{b.cancelReason}</Alert>
      )}

      {b.status === 'PENDING_PAYMENT' && (
        <Checkout
          bookingId={b.id}
          amountPaise={b.amountPaise}
          holdExpiresAt={b.holdExpiresAt}
          onDone={refresh}
        />
      )}

      <div className="grid gap-6 md:grid-cols-[1fr_300px]">
        <Card>
          <CardContent className="grid gap-3 pt-6 text-sm">
            <Row k="Address" v={`${b.location.address}, ${b.location.city}`} />
            <Row k="Vehicle" v={`${formatPlate(b.vehicle.plateNumber)} · ${b.vehicleType.name}`} />
            {b.zone && <Row k="Floor" v={`${b.zone.name} · ${b.zone.areaName}`} />}
            {b.slot && <Row k="Slot" v={<span className="font-semibold">{b.slot.label}</span>} />}
            <Row k="Plan" v={planLabel(b.planType, b.quantity)} />
            <Row k="From" v={fmtDateTime(b.startAt)} />
            <Row k="Until" v={fmtDateTime(b.endAt)} />
            <Row
              k="Amount"
              v={
                b.amountPaise === 0 ? (
                  <span className="font-medium text-success">Free</span>
                ) : (
                  formatRupees(b.amountPaise)
                )
              }
            />
            {b.refundedPaise > 0 && <Row k="Refunded" v={formatRupees(b.refundedPaise)} />}
            {b.cancelledAt && (
              <Row
                k="Cancelled"
                v={`${fmtDateTime(b.cancelledAt)}${b.cancelReason ? ` · ${b.cancelReason}` : ''}`}
              />
            )}
            {b.extendedFromId && (
              <Row
                k="Extends"
                v={
                  <Link className="underline" href={`/vehicle-owner/bookings/${b.extendedFromId}`}>
                    previous booking
                  </Link>
                }
              />
            )}
            <div className="flex flex-wrap gap-2 pt-2">
              <Button variant="outline" size="sm" asChild>
                <a
                  href={`https://www.google.com/maps/dir/?api=1&destination=${b.location.lat},${b.location.lng}`}
                  target="_blank"
                  rel="noreferrer"
                >
                  Directions
                </a>
              </Button>
              <Button variant="outline" size="sm" asChild>
                <Link href={`/vehicle-owner/book/${b.location.id}?vehicleType=${b.vehicleType.id}`}>
                  <RotateCcw /> Book again
                </Link>
              </Button>
            </div>
          </CardContent>
        </Card>

        {hasPass && (
          <Card>
            <CardHeader>
              <CardTitle className="text-lg">Entry pass</CardTitle>
            </CardHeader>
            <CardContent className="grid gap-3">
              {pass.data ? (
                <img
                  src={`data:image/svg+xml;utf8,${encodeURIComponent(pass.data.svg)}`}
                  alt={`Pass QR for booking ${b.code}`}
                  className="mx-auto aspect-square w-full max-w-60 rounded-md bg-white p-2"
                />
              ) : (
                <div className="aspect-square animate-pulse rounded-md bg-muted" />
              )}
              <div className="text-center">
                <p className="text-xs text-muted-foreground">Booking code</p>
                <p className="font-mono text-2xl font-bold tracking-widest">{b.code}</p>
              </div>
              <p className="text-center text-xs text-muted-foreground">
                Show the QR at the gate. If it won&apos;t scan, tell the booking code or your number
                plate. Your vehicle sticker works too.
              </p>
              <Button
                variant="outline"
                size="sm"
                loading={busy === 'pdf'}
                onClick={() =>
                  run(
                    'pdf',
                    () => openBlob(`/bookings/${b.id}/pass.pdf`, `quick-park-${b.code}.pdf`),
                    'Pass downloaded',
                  )
                }
              >
                <Download /> Download PDF
              </Button>
            </CardContent>
          </Card>
        )}
      </div>

      {(canCancel || canExtend) && (
        <div className="grid gap-4 md:grid-cols-2">
          {canExtend && (
            <Card>
              <CardHeader>
                <CardTitle className="text-lg">Extend</CardTitle>
              </CardHeader>
              <CardContent className="flex flex-wrap items-end gap-2">
                <label className="grid gap-1 text-sm">
                  Extra {planUnit(b.planType)}s
                  <Input
                    type="number"
                    min={1}
                    max={30}
                    value={extendQty}
                    onChange={(e) => setExtendQty(Math.max(1, Number(e.target.value) || 1))}
                    className="w-24"
                  />
                </label>
                <Button
                  loading={busy === 'extend'}
                  onClick={async () => {
                    if (
                      !(await ask({
                        title: `Extend by ${extendQty} ${planUnit(b.planType)}${extendQty === 1 ? '' : 's'}?`,
                        description:
                          b.amountPaise === 0
                            ? 'Free parking: the extra time is confirmed straight away.'
                            : 'You will be taken to pay for the extra time.',
                        confirmLabel: b.amountPaise === 0 ? 'Extend' : 'Extend & pay',
                      }))
                    )
                      return;
                    setBusy('extend');
                    setMsg(null);
                    try {
                      const ext = await api<BookingDto>(`/bookings/${b.id}/extend`, {
                        body: { quantity: extendQty },
                      });
                      router.push(`/vehicle-owner/bookings/${ext.id}`);
                    } catch (e) {
                      setMsg({ ok: false, text: errorMessage(e) });
                      setBusy(null);
                    }
                  }}
                >
                  {b.amountPaise === 0 ? 'Extend for free' : 'Extend & pay'}
                </Button>
              </CardContent>
            </Card>
          )}
          {canCancel && (
            <Card>
              <CardHeader>
                <CardTitle className="text-lg">Cancel</CardTitle>
              </CardHeader>
              <CardContent className="grid gap-2 text-sm">
                <p className="text-muted-foreground">
                  {b.status === 'PENDING_PAYMENT'
                    ? 'Release this unpaid hold.'
                    : b.amountPaise === 0
                      ? 'Free booking: cancel any time, nothing to refund.'
                      : `Refund if you cancel now: ${refundPct}% (${formatRupees(Math.floor((b.amountPaise * refundPct) / 100))}).`}
                </p>
                <Button
                  variant="destructive"
                  className="justify-self-start"
                  loading={busy === 'cancel'}
                  onClick={() => {
                    void ask({
                      title: 'Cancel this booking?',
                      description:
                        'Any refund follows the place’s cancellation policy. This cannot be undone.',
                      confirmLabel: 'Cancel booking',
                      cancelLabel: 'Keep booking',
                      tone: 'danger',
                    }).then((ok) => {
                      if (ok)
                        void run(
                          'cancel',
                          () => api(`/bookings/${b.id}/cancel`, { body: {} }),
                          'Booking cancelled',
                        );
                    });
                  }}
                >
                  Cancel booking
                </Button>
              </CardContent>
            </Card>
          )}
        </div>
      )}

      {b.status !== 'PENDING_PAYMENT' && (
        <Card>
          <CardHeader>
            <CardTitle className="text-lg">Problem with this booking?</CardTitle>
          </CardHeader>
          <CardContent className="grid gap-3">
            {disputes.data?.map((d) => (
              <div key={d.id} className="rounded-md border p-3 text-sm">
                <div className="flex items-center gap-2">
                  <StatusPill status={d.status} />
                  <span className="text-muted-foreground">{fmtDateTime(d.createdAt)}</span>
                </div>
                <p className="mt-1">{d.reason}</p>
                {d.resolution && (
                  <p className="mt-1 text-muted-foreground">
                    Admin: {d.resolution}
                    {d.refundPaise ? ` · refunded ${formatRupees(d.refundPaise)}` : ''}
                  </p>
                )}
              </div>
            ))}
            {!disputes.data?.some((d) => d.status === 'OPEN') && (
              <form
                className="grid gap-2"
                onSubmit={async (e) => {
                  e.preventDefault();
                  if (
                    !(await ask({
                      title: 'Report this problem?',
                      description: 'Our team will review it and reply on this booking.',
                      confirmLabel: 'Report problem',
                    }))
                  )
                    return;
                  void run(
                    'dispute',
                    () => api(`/bookings/${b.id}/disputes`, { body: { reason: issue } }),
                    'Thanks, our team will look into it',
                  ).then(() => setIssue(''));
                }}
              >
                <Textarea
                  value={issue}
                  onChange={(e) => setIssue(e.target.value)}
                  placeholder="Tell us what went wrong"
                  aria-label="Describe the problem"
                />
                <Button
                  type="submit"
                  variant="outline"
                  className="justify-self-start"
                  loading={busy === 'dispute'}
                  disabled={issue.trim().length < 10}
                >
                  Report a problem
                </Button>
              </form>
            )}
          </CardContent>
        </Card>
      )}
    </div>
  );
}

function Row({ k, v }: { k: string; v: React.ReactNode }) {
  return (
    <div className="grid grid-cols-[90px_1fr] gap-2">
      <span className="text-muted-foreground">{k}</span>
      <span>{v}</span>
    </div>
  );
}

import type { BookingDto, PassDto, PaymentOrderDto } from '@qp/types';
import { formatPlate, refundPctFor } from '@qp/validation';
import { useQuery, useQueryClient } from '@tanstack/react-query';
import { router, Stack, useLocalSearchParams } from 'expo-router';
import { useState } from 'react';
import { View } from 'react-native';
import { SvgXml } from 'react-native-svg';
import { api, ApiError } from '@/lib/api';
import {
  fmtDateTime,
  formatRupees,
  planLabel,
  planUnit,
  STATUS_LABEL,
  STATUS_TONE,
} from '@/lib/format';
import { useDialog } from '@/ui/dialog';
import {
  Badge,
  Button,
  Card,
  Empty,
  Input,
  KV,
  Loading,
  Notice,
  Row,
  Screen,
  Text,
} from '@/ui/kit';
import { useTheme } from '@/ui/theme';

export default function BookingScreen() {
  const { id } = useLocalSearchParams<{ id: string }>();
  const { theme } = useTheme();
  const qc = useQueryClient();
  const { confirm, showError, notify } = useDialog();
  const [busy, setBusy] = useState<string | null>(null);
  const [extendQty, setExtendQty] = useState(1);
  const [issue, setIssue] = useState('');
  // When the screen opened (refund %, can cancel/extend); pull to refresh updates it.
  const [now, setNow] = useState(() => Date.now());

  const booking = useQuery({
    queryKey: ['booking', id],
    queryFn: () => api<BookingDto>(`/bookings/${id}`),
    // While waiting for the payment to be confirmed, check every few seconds.
    refetchInterval: (q) => (q.state.data?.status === 'PENDING_PAYMENT' ? 4000 : false),
  });
  const b = booking.data;
  const hasPass = b && (b.status === 'CONFIRMED' || b.status === 'ACTIVE');
  const pass = useQuery({
    queryKey: ['pass', id],
    queryFn: () => api<PassDto>(`/bookings/${id}/pass`),
    enabled: !!hasPass,
  });

  const refresh = () => {
    setNow(Date.now());
    return Promise.all([
      qc.invalidateQueries({ queryKey: ['booking', id] }),
      qc.invalidateQueries({ queryKey: ['bookings'] }),
    ]);
  };

  if (booking.isPending) return <Loading />;
  if (!b)
    return (
      <Empty
        icon="alert-circle-outline"
        title={
          booking.error instanceof ApiError && booking.error.status === 404
            ? 'Booking not found'
            : 'Could not load the booking'
        }
      />
    );

  const run = async (key: string, fn: () => Promise<unknown>, done?: string) => {
    setBusy(key);
    try {
      await fn();
      await refresh();
      if (done) await notify(done);
    } catch (e) {
      await showError(e);
    } finally {
      setBusy(null);
    }
  };

  const pay = async () => {
    const ok = await confirm({
      title: `Pay ${formatRupees(b.amountPaise)}?`,
      description: 'The payment window opens next.',
      confirmLabel: 'Pay now',
    });
    if (!ok) return;
    setBusy('pay');
    try {
      const order = await api<PaymentOrderDto>('/payments/order', { body: { bookingId: b.id } });
      if (order.provider === 'mock') {
        const success = await confirm({
          title: 'Test payment',
          description: 'Test mode: no real money moves. Choose the payment result.',
          confirmLabel: 'Simulate success',
          cancelLabel: 'Simulate failure',
        });
        await api('/payments/mock/pay', {
          body: { orderId: order.orderId, outcome: success ? 'success' : 'failure' },
        });
        await refresh();
        if (!success)
          await showError(new Error('The payment failed. You can try again.'), 'Payment failed');
      } else {
        router.push({
          pathname: '/pay/[id]',
          params: {
            id: b.id,
            orderId: order.orderId,
            keyId: order.keyId ?? '',
            amount: String(order.amountPaise),
          },
        });
      }
    } catch (e) {
      await showError(e, 'Payment failed');
    } finally {
      setBusy(null);
    }
  };

  const hoursBefore = (new Date(b.startAt).getTime() - now) / 3_600_000;
  const refundPct = refundPctFor(b.cancellationRules, hoursBefore);
  const canCancel =
    b.status === 'PENDING_PAYMENT' ||
    (b.status === 'CONFIRMED' && new Date(b.startAt).getTime() > now);
  const canExtend =
    (b.status === 'CONFIRMED' || b.status === 'ACTIVE') &&
    b.planType !== 'EVENT' &&
    new Date(b.endAt).getTime() > now;
  const free = b.amountPaise === 0;

  return (
    <>
      <Stack.Screen options={{ title: b.code }} />
      <Screen onRefresh={() => void refresh()} refreshing={booking.isRefetching}>
        <Row style={{ justifyContent: 'space-between' }}>
          <Text variant="h2" style={{ flex: 1 }}>
            {b.location.name}
          </Text>
          <Badge label={STATUS_LABEL[b.status]} tone={STATUS_TONE[b.status]} />
        </Row>

        {b.checkInBy && (
          <Notice tone="warning">
            <Text color={theme.warning}>
              <Text bold color={theme.warning}>
                Check in by {fmtDateTime(b.checkInBy)}.
              </Text>{' '}
              If your vehicle hasn’t entered by then, the booking is released as a no-show (no
              refund).
            </Text>
          </Notice>
        )}
        {b.status === 'EXPIRED' && b.cancelReason ? (
          <Notice tone="danger">{b.cancelReason}</Notice>
        ) : null}

        {b.status === 'PENDING_PAYMENT' && (
          <Card>
            <Text variant="h2">Pay {formatRupees(b.amountPaise)} to confirm</Text>
            {b.holdExpiresAt && (
              <Text variant="muted">Slot held until {fmtDateTime(b.holdExpiresAt)}.</Text>
            )}
            <Button
              title="Pay now"
              icon="card-outline"
              size="lg"
              loading={busy === 'pay'}
              onPress={pay}
            />
          </Card>
        )}

        {hasPass && (
          <Card style={{ alignItems: 'center' }}>
            <Text variant="h2">Your entry pass</Text>
            {pass.data ? (
              <View style={{ backgroundColor: '#fff', padding: 14, borderRadius: 14 }}>
                <SvgXml xml={pass.data.svg} width={220} height={220} />
              </View>
            ) : (
              <Loading label="Loading pass…" />
            )}
            <Text variant="muted" style={{ textAlign: 'center' }}>
              Show this QR at the gate, or just your number plate:{' '}
              {formatPlate(b.vehicle.plateNumber)}
            </Text>
          </Card>
        )}

        <Card>
          <KV k="Address" v={`${b.location.address}, ${b.location.city}`} />
          <KV k="Vehicle" v={`${formatPlate(b.vehicle.plateNumber)} · ${b.vehicleType.name}`} />
          {b.zone && <KV k="Floor" v={`${b.zone.name} · ${b.zone.areaName}`} />}
          {b.slot && <KV k="Slot" v={b.slot.label} strong />}
          <KV k="Plan" v={planLabel(b.planType, b.quantity)} />
          <KV k="From" v={fmtDateTime(b.startAt)} />
          <KV k="Until" v={fmtDateTime(b.endAt)} />
          <KV k="Amount" v={free ? 'Free' : formatRupees(b.amountPaise)} strong />
          {b.refundedPaise > 0 && <KV k="Refunded" v={formatRupees(b.refundedPaise)} />}
          {b.cancelledAt && <KV k="Cancelled" v={fmtDateTime(b.cancelledAt)} />}
        </Card>

        {canExtend && (
          <Card>
            <Text variant="h2">Extend</Text>
            <Row>
              <Button
                title="−"
                variant="outline"
                onPress={() => setExtendQty((q) => Math.max(1, q - 1))}
                style={{ width: 52 }}
              />
              <Text variant="h2" style={{ flex: 1, textAlign: 'center' }}>
                {extendQty} {planUnit(b.planType)}
                {extendQty === 1 ? '' : 's'}
              </Text>
              <Button
                title="+"
                variant="outline"
                onPress={() => setExtendQty((q) => Math.min(30, q + 1))}
                style={{ width: 52 }}
              />
            </Row>
            <Button
              title={free ? 'Extend for free' : 'Extend & pay'}
              loading={busy === 'extend'}
              onPress={async () => {
                const ok = await confirm({
                  title: `Extend by ${extendQty} ${planUnit(b.planType)}${extendQty === 1 ? '' : 's'}?`,
                  description: free
                    ? 'Free parking: the extra time is confirmed straight away.'
                    : 'You will be taken to pay for the extra time.',
                  confirmLabel: free ? 'Extend' : 'Extend & pay',
                });
                if (!ok) return;
                setBusy('extend');
                try {
                  const ext = await api<BookingDto>(`/bookings/${b.id}/extend`, {
                    body: { quantity: extendQty },
                  });
                  await refresh();
                  router.push({ pathname: '/booking/[id]', params: { id: ext.id } });
                } catch (e) {
                  await showError(e, "Couldn't extend");
                } finally {
                  setBusy(null);
                }
              }}
            />
          </Card>
        )}

        {canCancel && (
          <Card>
            <Text variant="h2">Cancel</Text>
            <Text variant="muted">
              {b.status === 'PENDING_PAYMENT'
                ? 'Release this unpaid hold.'
                : free
                  ? 'Free booking: cancel any time, nothing to refund.'
                  : `Refund if you cancel now: ${refundPct}% (${formatRupees(Math.floor((b.amountPaise * refundPct) / 100))}).`}
            </Text>
            <Button
              title="Cancel booking"
              variant="danger"
              loading={busy === 'cancel'}
              onPress={async () => {
                const ok = await confirm({
                  title: 'Cancel this booking?',
                  description:
                    'Any refund follows the place’s cancellation policy. This cannot be undone.',
                  confirmLabel: 'Cancel booking',
                  cancelLabel: 'Keep booking',
                  tone: 'danger',
                });
                if (ok)
                  await run(
                    'cancel',
                    () => api(`/bookings/${b.id}/cancel`, { body: {} }),
                    'Booking cancelled',
                  );
              }}
            />
          </Card>
        )}

        {b.status !== 'PENDING_PAYMENT' && (
          <Card>
            <Text variant="h2">Problem with this booking?</Text>
            <Input
              value={issue}
              onChangeText={setIssue}
              placeholder="Tell us what went wrong"
              multiline
              style={{ minHeight: 90, textAlignVertical: 'top', paddingTop: 12 }}
            />
            <Button
              title="Report a problem"
              variant="outline"
              disabled={issue.trim().length < 10}
              loading={busy === 'dispute'}
              onPress={async () => {
                const ok = await confirm({
                  title: 'Report this problem?',
                  description: 'Our team will review it and reply on this booking.',
                  confirmLabel: 'Report problem',
                });
                if (!ok) return;
                await run(
                  'dispute',
                  () => api(`/bookings/${b.id}/disputes`, { body: { reason: issue.trim() } }),
                  'Thanks, our team will look into it',
                );
                setIssue('');
              }}
            />
          </Card>
        )}
      </Screen>
    </>
  );
}

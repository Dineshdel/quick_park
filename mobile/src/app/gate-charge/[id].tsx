import type { GateChargeDto } from '@qp/types';
import { formatPlate } from '@qp/validation';
import { useQuery } from '@tanstack/react-query';
import { router, useLocalSearchParams } from 'expo-router';
import { api, errorMessage } from '@/lib/api';
import { fmtDateTime, fmtDur, formatRupees } from '@/lib/format';
import { Button, Card, KV, Loading, Notice, Screen, Text } from '@/ui/kit';
import { useTheme } from '@/ui/theme';

/**
 * Overstay charge the gate sent to the driver. Paying it checks the vehicle out: the server closes the
 * session when the payment is confirmed, so the screen polls until the status is PAID.
 */
export default function GateChargeScreen() {
  const { id } = useLocalSearchParams<{ id: string }>();
  const { theme } = useTheme();
  const q = useQuery({
    queryKey: ['gate-charge', id],
    queryFn: () => api<GateChargeDto>(`/payments/gate/${id}`),
    refetchInterval: (query) => (query.state.data?.status === 'PENDING' ? 4000 : false),
  });
  const c = q.data;

  /** Opens the payment screen: the customer picks a UPI app, UPI ID, card or net banking there. */
  const pay = () => {
    if (!c?.order) return;
    const order = c.order;
    router.push({
      pathname: '/pay/[id]',
      params: {
        id: c.paymentId,
        provider: order.provider,
        orderId: order.orderId,
        keyId: order.keyId ?? '',
        amount: String(order.amountPaise),
        description: `Overstay charge · ${c.bookingCode}`,
        name: order.prefill?.name ?? '',
        email: order.prefill?.email ?? '',
        contact: order.prefill?.contact ?? '',
      },
    });
  };

  if (q.isPending) return <Loading />;
  if (!c)
    return (
      <Screen>
        <Notice tone="danger">{errorMessage(q.error)}</Notice>
      </Screen>
    );

  const paid = c.status === 'PAID';
  return (
    <Screen onRefresh={() => void q.refetch()} refreshing={q.isRefetching}>
      <Card
        style={{
          borderWidth: 2,
          borderColor: paid ? theme.success : c.status === 'PENDING' ? theme.warning : theme.border,
        }}
      >
        <Text variant="title" color={paid ? theme.success : undefined}>
          {paid ? `✓ Paid ${formatRupees(c.amountPaise)}` : `Pay ${formatRupees(c.amountPaise)}`}
        </Text>
        <Text variant="muted">
          {paid
            ? 'You are checked out. You may leave. Thank you!'
            : c.status === 'PENDING'
              ? 'Your vehicle stayed past the booking. Pay to check out; the gate is told as soon as it is paid.'
              : 'This request is no longer active (it was paid at the gate or replaced by a new one).'}
        </Text>
        <KV k="Vehicle" v={formatPlate(c.plateNumber)} />
        <KV k="Place" v={c.placeName} />
        <KV k="Booking" v={c.bookingCode} />
        <KV k="Stayed extra" v={fmtDur(c.overstayMinutes)} />
        <KV k="Requested" v={fmtDateTime(c.requestedAt)} />
        {c.paidAt ? <KV k="Paid" v={fmtDateTime(c.paidAt)} /> : null}
        <KV k="Amount" v={formatRupees(c.amountPaise)} strong />
        {c.status === 'PENDING' && c.order ? (
          <Button
            title={`Pay ${formatRupees(c.amountPaise)} now`}
            size="lg"
            onPress={() => void pay()}
          />
        ) : null}
      </Card>
    </Screen>
  );
}

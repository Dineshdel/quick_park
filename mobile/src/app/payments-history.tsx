import type { PaymentHistoryItemDto } from '@qp/types';
import { useQuery } from '@tanstack/react-query';
import { router } from 'expo-router';
import { View } from 'react-native';
import { api } from '@/lib/api';
import { fmtDateTime, formatRupees } from '@/lib/format';
import { Badge, Card, Empty, IconCircle, Loading, Row, Screen, Text } from '@/ui/kit';
import { useTheme } from '@/ui/theme';

const PURPOSE: Record<PaymentHistoryItemDto['purpose'], string> = {
  BOOKING: 'Booking',
  EXTENSION: 'Extra time',
  GATE_CHARGE: 'Overstay charge',
};

/** Every payment the driver made (and failed attempts), with refunds; tap one to open its booking. */
export default function PaymentHistoryScreen() {
  const { theme } = useTheme();
  const q = useQuery({
    queryKey: ['payment-history'],
    queryFn: () => api<PaymentHistoryItemDto[]>('/payments/history'),
  });
  const items = q.data ?? [];
  const paid = items.filter((p) => p.status === 'PAID');
  const total = paid.reduce((s, p) => s + p.amountPaise - p.refundedPaise, 0);

  return (
    <Screen onRefresh={() => void q.refetch()} refreshing={q.isRefetching}>
      {q.isPending ? (
        <Loading />
      ) : q.isError ? (
        <Empty
          icon="cloud-offline-outline"
          title="Couldn't load payments"
          text="Pull down to try again."
        />
      ) : !items.length ? (
        <Empty
          icon="receipt-outline"
          title="No payments yet"
          text="Payments for your bookings show up here."
        />
      ) : (
        <>
          <Card style={{ flexDirection: 'row', alignItems: 'center', gap: 14 }}>
            <IconCircle name="wallet" size={48} />
            <View style={{ flex: 1 }}>
              <Text variant="overline">Total spent</Text>
              <Text style={{ fontSize: 24, fontWeight: '800' }}>{formatRupees(total)}</Text>
              <Text variant="small">
                {paid.length} payment{paid.length === 1 ? '' : 's'} · after refunds
              </Text>
            </View>
          </Card>
          {items.map((p) => {
            const failed = p.status === 'FAILED';
            return (
              <Card
                key={p.id}
                onPress={() =>
                  router.push({ pathname: '/booking/[id]', params: { id: p.bookingId } })
                }
                style={{ flexDirection: 'row', alignItems: 'center', gap: 12 }}
              >
                <IconCircle
                  name={failed ? 'close' : p.purpose === 'GATE_CHARGE' ? 'time' : 'card'}
                  size={42}
                  color={failed ? theme.danger : theme.primary}
                  bg={failed ? theme.dangerBg : theme.primarySoft}
                />
                <View style={{ flex: 1, gap: 2 }}>
                  <Text style={{ fontWeight: '700' }} numberOfLines={1}>
                    {p.placeName}
                  </Text>
                  <Text variant="small">
                    {PURPOSE[p.purpose]} · {p.bookingCode}
                  </Text>
                  <Text variant="small">{fmtDateTime(p.paidAt ?? p.createdAt)}</Text>
                </View>
                <View style={{ alignItems: 'flex-end', gap: 4 }}>
                  <Text
                    style={{
                      fontWeight: '800',
                      fontSize: 16,
                      textDecorationLine: failed ? 'line-through' : 'none',
                    }}
                    color={failed ? theme.muted : theme.text}
                  >
                    {formatRupees(p.amountPaise)}
                  </Text>
                  {failed ? (
                    <Badge label="Failed" tone="danger" />
                  ) : p.refundedPaise > 0 ? (
                    <Row gap={4}>
                      <Badge label={`Refunded ${formatRupees(p.refundedPaise)}`} tone="info" />
                    </Row>
                  ) : (
                    <Badge label="Paid" tone="success" />
                  )}
                </View>
              </Card>
            );
          })}
        </>
      )}
    </Screen>
  );
}

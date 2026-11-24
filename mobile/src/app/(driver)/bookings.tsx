import type { BookingDto } from '@qp/types';
import { formatPlate } from '@qp/validation';
import { useQuery } from '@tanstack/react-query';
import { router } from 'expo-router';
import { useState } from 'react';
import { FlatList, View } from 'react-native';
import { api } from '@/lib/api';
import { fmtDateTime, formatRupees, planLabel, STATUS_LABEL, STATUS_TONE } from '@/lib/format';
import { Badge, Button, Card, Empty, Loading, Row, Segmented, Text } from '@/ui/kit';
import { useTheme } from '@/ui/theme';

type Tab = 'upcoming' | 'active' | 'past';

export default function Bookings() {
  const { theme } = useTheme();
  const [tab, setTab] = useState<Tab>('upcoming');
  const list = useQuery({
    queryKey: ['bookings', tab],
    queryFn: () => api<BookingDto[]>(`/bookings?tab=${tab}`),
  });
  return (
    <FlatList
      style={{ backgroundColor: theme.background }}
      contentContainerStyle={{ padding: 16, gap: 12, paddingBottom: 32 }}
      data={list.data ?? []}
      keyExtractor={(b) => b.id}
      refreshing={list.isRefetching}
      onRefresh={() => void list.refetch()}
      ListHeaderComponent={
        <Segmented
          value={tab}
          onChange={setTab}
          options={[
            { value: 'upcoming', label: 'Upcoming' },
            { value: 'active', label: 'Parked now' },
            { value: 'past', label: 'Past' },
          ]}
        />
      }
      ListEmptyComponent={
        list.isPending ? (
          <Loading />
        ) : (
          <Empty
            icon="ticket-outline"
            title={
              tab === 'active'
                ? 'Nothing parked right now'
                : tab === 'past'
                  ? 'No past bookings'
                  : 'No upcoming bookings'
            }
            action={
              tab === 'upcoming' ? (
                <Button
                  title="Find parking"
                  icon="search"
                  onPress={() => router.navigate('/(driver)')}
                />
              ) : undefined
            }
          />
        )
      }
      renderItem={({ item: b }) => (
        <Card onPress={() => router.push({ pathname: '/booking/[id]', params: { id: b.id } })}>
          <Row style={{ justifyContent: 'space-between' }}>
            <Text variant="h2" style={{ flex: 1 }} numberOfLines={1}>
              {b.location.name}
            </Text>
            <Badge label={STATUS_LABEL[b.status]} tone={STATUS_TONE[b.status]} />
          </Row>
          <Text variant="muted">
            {fmtDateTime(b.startAt)} → {fmtDateTime(b.endAt)}
          </Text>
          <Row style={{ justifyContent: 'space-between' }}>
            <View style={{ flex: 1 }}>
              <Text variant="small">
                {formatPlate(b.vehicle.plateNumber)} · {b.vehicleType.name} ·{' '}
                {planLabel(b.planType, b.quantity)}
                {b.zone ? ` · ${b.zone.name}${b.slot ? ` / ${b.slot.label}` : ''}` : ''}
              </Text>
            </View>
            <Text bold color={b.amountPaise === 0 ? theme.success : theme.text}>
              {b.amountPaise === 0 ? 'Free' : formatRupees(b.amountPaise)}
            </Text>
          </Row>
        </Card>
      )}
    />
  );
}

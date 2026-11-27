import type { NotificationDto } from '@qp/types';
import { useQueryClient } from '@tanstack/react-query';
import { router, Tabs } from 'expo-router';
import { FlatList, Pressable, View } from 'react-native';
import { api } from '@/lib/api';
import { fmtDateTime, formatRupees } from '@/lib/format';
import { Badge, Card, Empty, Loading, Row, Text } from '@/ui/kit';
import { useNotifications } from '@/ui/notification-bell';
import { useTheme } from '@/ui/theme';

/** The driver's notifications, e.g. an overstay charge the gate sent to pay online. */
export default function NotificationsScreen() {
  const { theme } = useTheme();
  const qc = useQueryClient();
  const q = useNotifications();
  const refresh = () => qc.invalidateQueries({ queryKey: ['notifications'] });

  const open = async (n: NotificationDto) => {
    if (!n.read)
      void api(`/notifications/${n.id}/read`, { body: {} }).then(refresh, () => undefined);
    if (n.paymentId) router.push({ pathname: '/gate-charge/[id]', params: { id: n.paymentId } });
  };

  return (
    <>
      <Tabs.Screen
        options={{
          headerRight: () =>
            q.data?.unread ? (
              <Pressable
                onPress={() => void api('/notifications/read-all', { body: {} }).then(refresh)}
                hitSlop={10}
              >
                <Text color={theme.primary} bold>
                  Mark all read
                </Text>
              </Pressable>
            ) : null,
        }}
      />
      <FlatList
        data={q.data?.items ?? []}
        keyExtractor={(n) => n.id}
        contentContainerStyle={{ padding: 16, gap: 10 }}
        refreshing={q.isRefetching}
        onRefresh={() => void q.refetch()}
        ListEmptyComponent={
          q.isPending ? (
            <Loading />
          ) : (
            <Empty icon="notifications-outline" title="No notifications yet" />
          )
        }
        renderItem={({ item: n }) => (
          <Card
            onPress={() => void open(n)}
            style={!n.read ? { borderColor: theme.primary, borderWidth: 1.5 } : undefined}
          >
            <Row style={{ alignItems: 'flex-start' }}>
              {!n.read && (
                <View
                  style={{
                    width: 8,
                    height: 8,
                    borderRadius: 4,
                    backgroundColor: theme.info,
                    marginTop: 7,
                  }}
                />
              )}
              <Text bold={!n.read} style={{ flex: 1 }}>
                {n.title}
              </Text>
            </Row>
            <Text variant="muted">{n.body}</Text>
            <Row style={{ justifyContent: 'space-between' }}>
              <Text variant="small">{fmtDateTime(n.createdAt)}</Text>
              {n.type === 'GATE_CHARGE_DUE' && !n.read && n.amountPaise ? (
                <Badge label={`Pay ${formatRupees(n.amountPaise)}`} tone="warning" />
              ) : null}
            </Row>
          </Card>
        )}
      />
    </>
  );
}

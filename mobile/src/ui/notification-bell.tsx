import Ionicons from '@expo/vector-icons/Ionicons';
import type { NotificationListDto } from '@qp/types';
import { useQuery } from '@tanstack/react-query';
import { router } from 'expo-router';
import { Pressable, View } from 'react-native';
import { api } from '../lib/api';
import { Text } from './kit';
import { useTheme } from './theme';

export const useNotifications = (enabled = true) =>
  useQuery({
    queryKey: ['notifications'],
    queryFn: () => api<NotificationListDto>('/notifications'),
    refetchInterval: 15_000,
    enabled,
  });

/** Header bell with the unread count; opens the notifications screen. */
export function NotificationBell() {
  const { theme } = useTheme();
  const unread = useNotifications().data?.unread ?? 0;
  return (
    <Pressable
      onPress={() => router.push('/notifications')}
      accessibilityLabel={unread ? `Notifications, ${unread} unread` : 'Notifications'}
      hitSlop={10}
      style={{ marginRight: 16 }}
    >
      <Ionicons name="notifications-outline" size={24} color={theme.text} />
      {unread > 0 && (
        <View
          style={{
            position: 'absolute',
            top: -4,
            right: -6,
            minWidth: 18,
            height: 18,
            borderRadius: 9,
            paddingHorizontal: 4,
            backgroundColor: theme.danger,
            alignItems: 'center',
            justifyContent: 'center',
          }}
        >
          <Text style={{ color: '#fff', fontSize: 11, fontWeight: '700' }}>
            {unread > 9 ? '9+' : unread}
          </Text>
        </View>
      )}
    </Pressable>
  );
}

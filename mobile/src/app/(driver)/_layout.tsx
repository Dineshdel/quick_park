import Ionicons from '@expo/vector-icons/Ionicons';
import { Redirect, Tabs } from 'expo-router';
import { useSession } from '@/lib/hooks';
import { NotificationBell, useNotifications } from '@/ui/notification-bell';
import { useTheme } from '@/ui/theme';

/** Driver (vehicle owner) app: find parking, bookings, vehicles, account. */
export default function DriverTabs() {
  const s = useSession();
  const { theme } = useTheme();
  const unread = useNotifications(
    s.status === 'authenticated' && s.user.role === 'VEHICLE_OWNER',
  ).data?.unread ?? 0;
  if (s.status === 'anonymous') return <Redirect href="/login" />;
  if (s.status === 'authenticated' && s.user.role !== 'VEHICLE_OWNER') return <Redirect href="/" />;
  const icon = (name: React.ComponentProps<typeof Ionicons>['name']) =>
    function TabBarIcon({ color, size }: { color: unknown; size: number }) {
      return <Ionicons name={name} size={size} color={color as string} />;
    };
  return (
    <Tabs
      screenOptions={{
        tabBarActiveTintColor: theme.primary,
        tabBarInactiveTintColor: theme.muted,
        tabBarStyle: { backgroundColor: theme.card, borderTopColor: theme.border },
        headerStyle: { backgroundColor: theme.card },
        headerTintColor: theme.text,
        headerTitleStyle: { fontWeight: '700' },
        sceneStyle: { backgroundColor: theme.background },
        headerRight: () => <NotificationBell />,
      }}
    >
      <Tabs.Screen
        name="index"
        options={{ title: 'Find parking', tabBarLabel: 'Find', tabBarIcon: icon('search') }}
      />
      <Tabs.Screen
        name="bookings"
        options={{
          title: 'My bookings',
          tabBarLabel: 'Bookings',
          tabBarIcon: icon('ticket-outline'),
        }}
      />
      <Tabs.Screen
        name="vehicles"
        options={{ title: 'My vehicles', tabBarLabel: 'Vehicles', tabBarIcon: icon('car-outline') }}
      />
      <Tabs.Screen
        name="notifications"
        options={{
          title: 'Notifications',
          tabBarLabel: 'Alerts',
          tabBarIcon: icon('notifications-outline'),
          tabBarBadge: unread ? (unread > 9 ? '9+' : unread) : undefined,
        }}
      />
      <Tabs.Screen
        name="account"
        options={{ title: 'Account', tabBarIcon: icon('person-circle-outline') }}
      />
    </Tabs>
  );
}

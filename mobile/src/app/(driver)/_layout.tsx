import { Redirect, Tabs } from 'expo-router';
import { useSession } from '@/lib/hooks';
import { useNotifications } from '@/ui/notification-bell';
import { AppTabBar, tabIcon, useTabOptions } from '@/ui/navigation';

/** Driver (vehicle owner) app: find parking, bookings, vehicles, account. */
export default function DriverTabs() {
  const s = useSession();
  const tabs = useTabOptions();
  const unread =
    useNotifications(s.status === 'authenticated' && s.user.role === 'VEHICLE_OWNER').data
      ?.unread ?? 0;
  if (s.status === 'anonymous') return <Redirect href="/login" />;
  if (s.status === 'authenticated' && s.user.role !== 'VEHICLE_OWNER') return <Redirect href="/" />;
  return (
    <Tabs
      tabBar={(props) => <AppTabBar {...props} />}
      screenOptions={{
        ...tabs,
      }}
    >
      <Tabs.Screen
        name="index"
        options={{
          title: 'Find parking',
          tabBarLabel: 'Home',
          headerShown: false,
          tabBarIcon: tabIcon('home-outline', 'home'),
        }}
      />
      <Tabs.Screen
        name="bookings"
        options={{
          title: 'My bookings',
          tabBarLabel: 'Bookings',
          tabBarIcon: tabIcon('ticket-outline', 'ticket'),
        }}
      />
      <Tabs.Screen
        name="vehicles"
        options={{
          title: 'My vehicles',
          tabBarLabel: 'Vehicles',
          tabBarIcon: tabIcon('car-outline', 'car'),
        }}
      />
      <Tabs.Screen
        name="notifications"
        options={{
          title: 'Notifications',
          tabBarLabel: 'Alerts',
          tabBarIcon: tabIcon('notifications-outline', 'notifications'),
          tabBarBadge: unread ? (unread > 9 ? '9+' : unread) : undefined,
        }}
      />
      <Tabs.Screen
        name="account"
        options={{
          title: 'Account',
          tabBarIcon: tabIcon('person-circle-outline', 'person-circle'),
        }}
      />
    </Tabs>
  );
}

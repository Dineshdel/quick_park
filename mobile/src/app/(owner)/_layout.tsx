import { Redirect, Tabs } from 'expo-router';
import { GateProvider } from '@/lib/gate';
import { useSession } from '@/lib/hooks';
import { AppTabBar, tabIcon, useTabOptions } from '@/ui/navigation';

/** Gate staff (parking owner) app: scan in/out, vehicles inside with live overstay, account. */
export default function OwnerTabs() {
  const s = useSession();
  const tabs = useTabOptions({ bell: false });
  if (s.status === 'anonymous') return <Redirect href="/login" />;
  if (s.status === 'authenticated' && s.user.role !== 'PARKING_OWNER') return <Redirect href="/" />;
  return (
    <GateProvider>
      <Tabs
        tabBar={(props) => <AppTabBar {...props} />}
        screenOptions={{
          ...tabs,
        }}
      >
        <Tabs.Screen
          name="index"
          options={{
            title: 'Gate scanner',
            tabBarLabel: 'Scanner',
            tabBarIcon: tabIcon('qr-code-outline', 'qr-code'),
          }}
        />
        <Tabs.Screen
          name="inside"
          options={{
            title: 'Inside now',
            tabBarLabel: 'Inside',
            tabBarIcon: tabIcon('car-outline', 'car'),
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
    </GateProvider>
  );
}

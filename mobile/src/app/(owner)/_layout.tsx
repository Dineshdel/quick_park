import Ionicons from '@expo/vector-icons/Ionicons';
import { Redirect, Tabs } from 'expo-router';
import { GateProvider } from '@/lib/gate';
import { useSession } from '@/lib/hooks';
import { useTheme } from '@/ui/theme';

/** Gate staff (parking owner) app: scan in/out, vehicles inside with live overstay, account. */
export default function OwnerTabs() {
  const s = useSession();
  const { theme } = useTheme();
  if (s.status === 'anonymous') return <Redirect href="/login" />;
  if (s.status === 'authenticated' && s.user.role !== 'PARKING_OWNER') return <Redirect href="/" />;
  const icon = (name: React.ComponentProps<typeof Ionicons>['name']) =>
    function TabBarIcon({ color, size }: { color: unknown; size: number }) {
      return <Ionicons name={name} size={size} color={color as string} />;
    };
  return (
    <GateProvider>
      <Tabs
        screenOptions={{
          tabBarActiveTintColor: theme.primary,
          tabBarInactiveTintColor: theme.muted,
          tabBarStyle: { backgroundColor: theme.card, borderTopColor: theme.border },
          headerStyle: { backgroundColor: theme.card },
          headerTintColor: theme.text,
          headerTitleStyle: { fontWeight: '700' },
          sceneStyle: { backgroundColor: theme.background },
        }}
      >
        <Tabs.Screen
          name="index"
          options={{
            title: 'Gate scanner',
            tabBarLabel: 'Scanner',
            tabBarIcon: icon('qr-code-outline'),
          }}
        />
        <Tabs.Screen
          name="inside"
          options={{ title: 'Inside now', tabBarLabel: 'Inside', tabBarIcon: icon('car-outline') }}
        />
        <Tabs.Screen
          name="account"
          options={{ title: 'Account', tabBarIcon: icon('person-circle-outline') }}
        />
      </Tabs>
    </GateProvider>
  );
}

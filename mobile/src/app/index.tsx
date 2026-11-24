import { Redirect } from 'expo-router';
import { Linking, View } from 'react-native';
import { signOut } from '@/lib/api';
import { WEB_URL } from '@/lib/config';
import { useSession } from '@/lib/hooks';
import { Button, Loading, Screen, Text } from '@/ui/kit';

/** Sends each user to their part of the app: customers → find parking, parking owners → gate scanner. */
export default function Index() {
  const s = useSession();
  if (s.status === 'loading') return <Loading label="Starting Quick Park…" />;
  if (s.status === 'anonymous') return <Redirect href="/login" />;
  const role = s.user.role;
  if (!role) return <Redirect href="/choose-role" />;
  if (role === 'VEHICLE_OWNER') return <Redirect href="/(driver)" />;
  if (role === 'PARKING_OWNER') return <Redirect href="/(owner)" />;
  return (
    <Screen edges={['top', 'bottom']}>
      <View style={{ gap: 12, paddingTop: 40 }}>
        <Text variant="title">Admin accounts use the website</Text>
        <Text variant="muted">
          The mobile app is for drivers and gate staff. Open the admin dashboard in a browser.
        </Text>
        <Button
          title="Open website"
          icon="open-outline"
          onPress={() => void Linking.openURL(`${WEB_URL}/admin`)}
        />
        <Button title="Sign out" variant="outline" onPress={() => void signOut()} />
      </View>
    </Screen>
  );
}

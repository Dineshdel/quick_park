import Constants from 'expo-constants';
import { router } from 'expo-router';
import { Linking, View } from 'react-native';
import { signOut } from '../lib/api';
import { API_URL, WEB_URL } from '../lib/config';
import { useSession } from '../lib/hooks';
import { useDialog } from './dialog';
import { Button, Card, KV, ListItem, Screen, SectionHeader, Text } from './kit';
import { useTheme } from './theme';

/** Profile, day/night switch, website shortcuts and sign out (drivers and gate staff). */
export function AccountScreen() {
  const s = useSession();
  const { theme, toggle } = useTheme();
  const { confirm } = useDialog();
  if (s.status !== 'authenticated') return null;
  const u = s.user;
  const owner = u.role === 'PARKING_OWNER';
  return (
    <Screen>
      <Card>
        <Text variant="h2">{u.name}</Text>
        <Text variant="muted">{u.email}</Text>
        <KV k="Account" v={owner ? 'Parking owner' : 'Driver'} />
        {u.phone ? <KV k="Phone" v={u.phone} /> : null}
      </Card>
      {!owner && (
        <View style={{ gap: 10 }}>
          <SectionHeader title="My activity" />
          <ListItem
            icon="receipt"
            title="Payment history"
            subtitle="Every payment and refund"
            onPress={() => router.push('/payments-history')}
          />
          <ListItem
            icon="chatbubbles"
            title="Help & queries"
            subtitle="Raise a query and see our replies"
            onPress={() => router.push('/queries')}
          />
        </View>
      )}
      <Card>
        <Text variant="h2">Appearance</Text>
        <Button
          title={theme.mode === 'dark' ? 'Switch to day mode' : 'Switch to night mode'}
          icon={theme.mode === 'dark' ? 'sunny-outline' : 'moon-outline'}
          variant="outline"
          onPress={toggle}
        />
      </Card>
      <Card>
        <Text variant="h2">On the website</Text>
        <Text variant="muted">
          {owner
            ? 'Add places, floors and slot numbers, set prices and see earnings on the website.'
            : 'Edit your profile, change your password and print your QR sticker on the website.'}
        </Text>
        <Button
          title="Open website"
          icon="open-outline"
          variant="outline"
          onPress={() =>
            void Linking.openURL(owner ? `${WEB_URL}/parking-owner` : `${WEB_URL}/account`)
          }
        />
      </Card>
      <Button
        title="Sign out"
        icon="log-out-outline"
        variant="danger"
        onPress={async () => {
          if (await confirm({ title: 'Sign out?', confirmLabel: 'Sign out', tone: 'danger' }))
            await signOut();
        }}
      />
      <Text variant="small" style={{ textAlign: 'center' }} color={theme.muted}>
        Quick Park {Constants.expoConfig?.version} · {API_URL}
      </Text>
    </Screen>
  );
}

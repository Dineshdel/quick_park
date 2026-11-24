import { Link } from 'expo-router';
import { useState } from 'react';
import { KeyboardAvoidingView, Linking, Platform, View } from 'react-native';
import { api, session, type AuthResult } from '@/lib/api';
import { WEB_URL } from '@/lib/config';
import { useDialog } from '@/ui/dialog';
import { Button, Field, Input, Row, Screen, Text } from '@/ui/kit';
import { useTheme } from '@/ui/theme';

export default function Login() {
  const { theme } = useTheme();
  const { showError } = useDialog();
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [busy, setBusy] = useState(false);

  const submit = async () => {
    if (!email.trim() || !password)
      return void showError(new Error('Enter your email and password.'), 'Missing details');
    setBusy(true);
    try {
      await session.apply(
        await api<AuthResult>('/auth/login', { body: { email: email.trim(), password } }),
      );
    } catch (e) {
      await showError(e, "Couldn't sign in");
    } finally {
      setBusy(false);
    }
  };

  return (
    <KeyboardAvoidingView
      style={{ flex: 1 }}
      behavior={Platform.OS === 'ios' ? 'padding' : undefined}
    >
      <Screen edges={['top', 'bottom']}>
        <View
          style={{
            backgroundColor: theme.chrome,
            borderRadius: 20,
            padding: 22,
            gap: 6,
            marginTop: 24,
          }}
        >
          <Text variant="title" color={theme.chromeText}>
            Quick{' '}
            <Text variant="title" color={theme.gold}>
              Park
            </Text>
          </Text>
          <Text color={theme.chromeText} style={{ opacity: 0.8 }}>
            Find, book and enter parking with a QR code.
          </Text>
        </View>
        <Text variant="h2" style={{ marginTop: 8 }}>
          Sign in
        </Text>
        <Field label="Email">
          <Input
            value={email}
            onChangeText={setEmail}
            autoCapitalize="none"
            autoComplete="email"
            keyboardType="email-address"
            placeholder="you@example.com"
          />
        </Field>
        <Field label="Password">
          <Input
            value={password}
            onChangeText={setPassword}
            secureTextEntry
            autoComplete="password"
            placeholder="Your password"
            onSubmitEditing={submit}
          />
        </Field>
        <Button title="Sign in" size="lg" loading={busy} onPress={submit} />
        <Button
          title="Forgot password?"
          variant="ghost"
          onPress={() => void Linking.openURL(`${WEB_URL}/forgot-password`)}
        />
        <Row style={{ justifyContent: 'center' }}>
          <Text variant="muted">New to Quick Park?</Text>
          <Link href="/register" style={{ color: theme.primary, fontWeight: '700', fontSize: 15 }}>
            Create an account
          </Link>
        </Row>
      </Screen>
    </KeyboardAvoidingView>
  );
}

import type { SelfServiceRole } from '@qp/types';
import { registerSchema } from '@qp/validation';
import { Link, router } from 'expo-router';
import { useState } from 'react';
import { KeyboardAvoidingView, Platform } from 'react-native';
import { api, session, type AuthResult } from '@/lib/api';
import { useDialog } from '@/ui/dialog';
import { Button, Field, Input, Row, Screen, Segmented, Text } from '@/ui/kit';
import { useTheme } from '@/ui/theme';

export default function Register() {
  const { theme } = useTheme();
  const { confirm, showError } = useDialog();
  const [name, setName] = useState('');
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [role, setRole] = useState<SelfServiceRole>('VEHICLE_OWNER');
  const [errors, setErrors] = useState<Record<string, string>>({});
  const [busy, setBusy] = useState(false);

  const submit = async () => {
    const parsed = registerSchema.safeParse({ name, email: email.trim(), password, role });
    if (!parsed.success) {
      setErrors(Object.fromEntries(parsed.error.issues.map((i) => [String(i.path[0]), i.message])));
      return;
    }
    setErrors({});
    setBusy(true);
    try {
      const r = await api<{ verificationRequired: boolean }>('/auth/register', {
        body: parsed.data,
      });
      if (!r.verificationRequired) {
        // No email check needed: sign straight in.
        await session.apply(
          await api<AuthResult>('/auth/login', { body: { email: parsed.data.email, password } }),
        );
      } else {
        await confirm({
          title: 'Check your email',
          description: `We sent a verification link to ${parsed.data.email}. Open it, then sign in here.`,
          confirmLabel: 'OK',
          cancelLabel: null,
        });
        router.replace('/login');
      }
    } catch (e) {
      await showError(e, "Couldn't create the account");
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
        <Text variant="title" style={{ marginTop: 24 }}>
          Create your account
        </Text>
        <Field label="I want to">
          <Segmented
            value={role}
            onChange={setRole}
            options={[
              { value: 'VEHICLE_OWNER', label: 'Park my vehicle' },
              { value: 'PARKING_OWNER', label: 'Run a parking place' },
            ]}
          />
        </Field>
        <Field label="Full name" error={errors.name}>
          <Input value={name} onChangeText={setName} autoComplete="name" placeholder="Your name" />
        </Field>
        <Field label="Email" error={errors.email}>
          <Input
            value={email}
            onChangeText={setEmail}
            autoCapitalize="none"
            keyboardType="email-address"
            autoComplete="email"
            placeholder="you@example.com"
          />
        </Field>
        <Field label="Password" error={errors.password} hint="At least 8 characters.">
          <Input
            value={password}
            onChangeText={setPassword}
            secureTextEntry
            autoComplete="new-password"
            placeholder="Choose a password"
          />
        </Field>
        <Button title="Create account" size="lg" loading={busy} onPress={submit} />
        <Row style={{ justifyContent: 'center' }}>
          <Text variant="muted">Already have an account?</Text>
          <Link href="/login" style={{ color: theme.primary, fontWeight: '700', fontSize: 15 }}>
            Sign in
          </Link>
        </Row>
      </Screen>
    </KeyboardAvoidingView>
  );
}

import type { SelfServiceRole } from '@qp/types';
import { router } from 'expo-router';
import { useState } from 'react';
import { api, session, type AuthResult } from '@/lib/api';
import { useDialog } from '@/ui/dialog';
import { Button, Card, Icon, Row, Screen, Text, type IconName } from '@/ui/kit';

const ROLES: { role: SelfServiceRole; title: string; text: string; icon: IconName }[] = [
  {
    role: 'VEHICLE_OWNER',
    title: 'I park my vehicle',
    text: 'Find and book parking, enter with a QR code.',
    icon: 'car-sport-outline',
  },
  {
    role: 'PARKING_OWNER',
    title: 'I run a parking place',
    text: 'Check vehicles in and out at the gate.',
    icon: 'business-outline',
  },
];

export default function ChooseRole() {
  const { confirm, showError } = useDialog();
  const [busy, setBusy] = useState<SelfServiceRole | null>(null);
  const pick = async (role: SelfServiceRole) => {
    const ok = await confirm({
      title: `Continue as ${role === 'VEHICLE_OWNER' ? 'a driver' : 'a parking owner'}?`,
      description: 'You can’t change this later.',
      confirmLabel: 'Continue',
    });
    if (!ok) return;
    setBusy(role);
    try {
      await session.apply(await api<AuthResult>('/auth/choose-role', { body: { role } }));
      router.replace('/');
    } catch (e) {
      await showError(e);
    } finally {
      setBusy(null);
    }
  };
  return (
    <Screen>
      <Text variant="muted">How will you use Quick Park?</Text>
      {ROLES.map((r) => (
        <Card key={r.role}>
          <Row gap={12}>
            <Icon name={r.icon} size={28} />
            <Text variant="h2" style={{ flex: 1 }}>
              {r.title}
            </Text>
          </Row>
          <Text variant="muted">{r.text}</Text>
          <Button
            title="Choose"
            loading={busy === r.role}
            disabled={!!busy}
            onPress={() => void pick(r.role)}
          />
        </Card>
      ))}
    </Screen>
  );
}

import type { VehicleDto } from '@qp/types';
import { formatPlate, vehicleCreateSchema } from '@qp/validation';
import { useQueryClient } from '@tanstack/react-query';
import { router } from 'expo-router';
import { useState } from 'react';
import { View } from 'react-native';
import { api } from '@/lib/api';
import { useVehicles, useVehicleTypes } from '@/lib/hooks';
import { useDialog } from '@/ui/dialog';
import {
  Button,
  Card,
  Empty,
  Field,
  Icon,
  Input,
  Loading,
  Row,
  Screen,
  Select,
  Text,
} from '@/ui/kit';

export default function Vehicles() {
  const qc = useQueryClient();
  const { confirm, showError } = useDialog();
  const vehicles = useVehicles();
  const types = useVehicleTypes();
  const [editing, setEditing] = useState<VehicleDto | null>(null);
  const [plate, setPlate] = useState('');
  const [typeId, setTypeId] = useState('');
  const [error, setError] = useState<string | undefined>();
  const [busy, setBusy] = useState(false);

  const reset = () => {
    setEditing(null);
    setPlate('');
    setTypeId('');
    setError(undefined);
  };

  const save = async () => {
    const parsed = vehicleCreateSchema.safeParse({ vehicleTypeId: typeId, plateNumber: plate });
    if (!parsed.success) return setError(parsed.error.issues[0]?.message);
    setError(undefined);
    const ok = await confirm({
      title: editing ? 'Save vehicle changes?' : `Add ${formatPlate(parsed.data.plateNumber)}?`,
      confirmLabel: editing ? 'Save' : 'Add vehicle',
    });
    if (!ok) return;
    setBusy(true);
    try {
      if (editing) await api(`/vehicles/${editing.id}`, { method: 'PATCH', body: parsed.data });
      else await api('/vehicles', { body: parsed.data });
      await qc.invalidateQueries({ queryKey: ['vehicles'] });
      reset();
    } catch (e) {
      await showError(e, "Couldn't save the vehicle");
    } finally {
      setBusy(false);
    }
  };

  const remove = async (v: VehicleDto) => {
    const ok = await confirm({
      title: `Remove ${formatPlate(v.plateNumber)}?`,
      description: 'Its QR sticker will stop working.',
      confirmLabel: 'Remove',
      tone: 'danger',
    });
    if (!ok) return;
    try {
      await api(`/vehicles/${v.id}`, { method: 'DELETE' });
      await qc.invalidateQueries({ queryKey: ['vehicles'] });
    } catch (e) {
      await showError(e, "Couldn't remove the vehicle");
    }
  };

  return (
    <Screen onRefresh={() => void vehicles.refetch()} refreshing={vehicles.isRefetching}>
      <Card>
        <Text variant="h2">
          {editing ? `Edit ${formatPlate(editing.plateNumber)}` : 'Add a vehicle'}
        </Text>
        <Field label="Vehicle type">
          <Select
            value={typeId}
            onChange={setTypeId}
            title="Vehicle type"
            placeholder="Choose the type"
            options={(types.data ?? [])
              .filter((t) => t.isActive)
              .map((t) => ({ value: t.id, label: t.name }))}
          />
        </Field>
        <Field label="Number plate" error={error} hint="e.g. TN 10 AB 1234">
          <Input
            value={plate}
            onChangeText={(t) => setPlate(t.toUpperCase())}
            autoCapitalize="characters"
            placeholder="TN10AB1234"
          />
        </Field>
        <Row>
          <Button
            title={editing ? 'Save' : 'Add vehicle'}
            loading={busy}
            onPress={save}
            style={{ flex: 1 }}
          />
          {editing && <Button title="Cancel" variant="outline" onPress={reset} />}
        </Row>
      </Card>

      {vehicles.isPending ? (
        <Loading />
      ) : !vehicles.data?.length ? (
        <Empty
          icon="car-outline"
          title="No vehicles yet"
          text="Add your vehicle to book parking."
        />
      ) : (
        vehicles.data.map((v) => (
          <Card key={v.id}>
            <Row gap={12}>
              <Icon
                name={
                  v.vehicleType.code === 'BIKE' || /bike|two/i.test(v.vehicleType.name)
                    ? 'bicycle-outline'
                    : 'car-sport-outline'
                }
                size={26}
              />
              <View style={{ flex: 1 }}>
                <Text variant="h2">{formatPlate(v.plateNumber)}</Text>
                <Text variant="muted">{v.vehicleType.name}</Text>
              </View>
            </Row>
            <Row style={{ flexWrap: 'wrap' }}>
              <Button
                title="QR sticker"
                icon="qr-code-outline"
                size="sm"
                variant="outline"
                onPress={() => router.push({ pathname: '/vehicle/[id]', params: { id: v.id } })}
              />
              <Button
                title="Edit"
                icon="create-outline"
                size="sm"
                variant="outline"
                onPress={() => {
                  setEditing(v);
                  setTypeId(v.vehicleType.id);
                  setPlate(formatPlate(v.plateNumber));
                }}
              />
              <Button
                title="Remove"
                icon="trash-outline"
                size="sm"
                variant="ghost"
                onPress={() => void remove(v)}
              />
            </Row>
          </Card>
        ))
      )}
    </Screen>
  );
}

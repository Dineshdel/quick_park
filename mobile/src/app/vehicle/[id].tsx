import type { VehicleQrDto } from '@qp/types';
import { formatPlate } from '@qp/validation';
import { useQuery, useQueryClient } from '@tanstack/react-query';
import { useLocalSearchParams } from 'expo-router';
import { useState } from 'react';
import { View } from 'react-native';
import { SvgXml } from 'react-native-svg';
import { api } from '@/lib/api';
import { useDialog } from '@/ui/dialog';
import { Button, Card, Loading, Notice, Screen, Text } from '@/ui/kit';

/** The vehicle's permanent QR (for a windscreen sticker): enter any place where you have a booking. */
export default function VehicleQr() {
  const { id } = useLocalSearchParams<{ id: string }>();
  const qc = useQueryClient();
  const { confirm, showError } = useDialog();
  const [rotated, setRotated] = useState(false);
  const qr = useQuery({
    queryKey: ['vehicle-qr', id],
    queryFn: () => api<VehicleQrDto>(`/vehicles/${id}/qr`),
  });

  const rotate = async () => {
    const ok = await confirm({
      title: 'Make a new QR code?',
      description: 'Any sticker you already printed will stop working.',
      confirmLabel: 'Make new code',
      tone: 'danger',
    });
    if (!ok) return;
    try {
      qc.setQueryData(
        ['vehicle-qr', id],
        await api<VehicleQrDto>(`/vehicles/${id}/qr/rotate`, { body: {} }),
      );
      setRotated(true);
    } catch (e) {
      await showError(e, 'Could not create a new code');
    }
  };

  if (qr.isPending) return <Loading />;
  if (!qr.data) return <Notice tone="danger">Could not load the QR code.</Notice>;
  return (
    <Screen>
      {rotated && (
        <Notice tone="success">
          New QR code created. Replace the old sticker, which no longer works.
        </Notice>
      )}
      <Card style={{ alignItems: 'center' }}>
        <Text variant="title">{formatPlate(qr.data.plateNumber)}</Text>
        <Text variant="muted">{qr.data.vehicleTypeName}</Text>
        <View style={{ backgroundColor: '#fff', padding: 16, borderRadius: 16 }}>
          <SvgXml xml={qr.data.svg} width={240} height={240} />
        </View>
        <Text variant="muted" style={{ textAlign: 'center' }}>
          Gate staff can scan this at any place where this vehicle has a booking. Print it from the
          website to stick on your windscreen.
        </Text>
      </Card>
      <Button title="Make a new code" icon="refresh" variant="outline" onPress={rotate} />
    </Screen>
  );
}

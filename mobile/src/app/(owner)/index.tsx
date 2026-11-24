import { CameraView, useCameraPermissions } from 'expo-camera';
import { useFocusEffect } from 'expo-router';
import { useCallback, useRef, useState } from 'react';
import { Linking, View } from 'react-native';
import { WEB_URL } from '@/lib/config';
import { useGate, type Direction } from '@/lib/gate';
import {
  Button,
  Card,
  Empty,
  Field,
  Input,
  Loading,
  Row,
  Screen,
  Segmented,
  Select,
  Text,
} from '@/ui/kit';
import { ScanOutcome } from '@/ui/scan-outcome';
import { useTheme } from '@/ui/theme';

/** Gate scanner: camera reads the pass QR or the vehicle sticker; or type the number plate / booking code. */
export default function Scanner() {
  const { theme } = useTheme();
  const gate = useGate();
  const [direction, setDirection] = useState<Direction>('ENTRY');
  const [text, setText] = useState('');
  const [cameraOn, setCameraOn] = useState(true);
  const [focused, setFocused] = useState(true);
  const [permission, requestPermission] = useCameraPermissions();
  const last = useRef<{ data: string; at: number }>({ data: '', at: 0 });

  // Only one camera preview may run: stop it when this tab isn't showing.
  useFocusEffect(
    useCallback(() => {
      setFocused(true);
      return () => setFocused(false);
    }, []),
  );

  const onScanned = ({ data }: { data: string }) => {
    const now = Date.now();
    // The camera reports the same code many times a second: ignore repeats for 4 s and while busy.
    if (gate.busy || (data === last.current.data && now - last.current.at < 4000)) return;
    last.current = { data, at: now };
    void gate.scan(data, direction);
  };

  if (gate.placesLoading) return <Loading />;
  if (!gate.places.length)
    return (
      <Screen>
        <Empty
          icon="business-outline"
          title="No live parking place yet"
          text="Add your place, slots and prices on the website and get it approved. Then you can check vehicles in here."
          action={
            <Button
              title="Open website"
              icon="open-outline"
              onPress={() => void Linking.openURL(`${WEB_URL}/parking-owner/locations`)}
            />
          }
        />
      </Screen>
    );

  return (
    <Screen>
      {gate.places.length > 1 && (
        <Field label="Parking place">
          <Select
            value={gate.place?.id ?? ''}
            onChange={gate.setPlaceId}
            title="Parking place"
            options={gate.places.map((p) => ({ value: p.id, label: p.name }))}
          />
        </Field>
      )}
      <Segmented
        value={direction}
        onChange={(d) => {
          setDirection(d);
          gate.clearOutcome();
        }}
        options={[
          { value: 'ENTRY', label: 'Check in' },
          { value: 'EXIT', label: 'Check out' },
        ]}
      />

      <ScanOutcome />

      <Card style={{ padding: 0, overflow: 'hidden', gap: 0 }}>
        {!cameraOn ? null : !permission ? (
          <Loading label="Starting camera…" />
        ) : !permission.granted ? (
          <View style={{ padding: 16, gap: 10 }}>
            <Text>Allow the camera to scan passes and vehicle stickers.</Text>
            <Button
              title="Allow camera"
              icon="camera-outline"
              onPress={() =>
                void (permission.canAskAgain ? requestPermission() : Linking.openSettings())
              }
            />
          </View>
        ) : focused ? (
          <View style={{ height: 300, backgroundColor: '#000' }}>
            <CameraView
              style={{ flex: 1 }}
              facing="back"
              barcodeScannerSettings={{ barcodeTypes: ['qr'] }}
              onBarcodeScanned={onScanned}
            />
            <View
              pointerEvents="none"
              style={{
                position: 'absolute',
                top: 50,
                left: 60,
                right: 60,
                bottom: 50,
                borderWidth: 3,
                borderColor: direction === 'ENTRY' ? theme.success : theme.gold,
                borderRadius: 18,
              }}
            />
            <View
              style={{
                position: 'absolute',
                bottom: 10,
                alignSelf: 'center',
                backgroundColor: 'rgba(0,0,0,0.6)',
                paddingHorizontal: 12,
                paddingVertical: 5,
                borderRadius: 8,
              }}
            >
              <Text color="#fff" style={{ fontSize: 13 }}>
                {gate.busy
                  ? 'Checking…'
                  : `Point at the QR to ${direction === 'ENTRY' ? 'check in' : 'check out'}`}
              </Text>
            </View>
          </View>
        ) : null}
        <View style={{ padding: 12 }}>
          <Button
            title={cameraOn ? 'Turn camera off' : 'Turn camera on'}
            icon={cameraOn ? 'videocam-off-outline' : 'videocam-outline'}
            variant="ghost"
            size="sm"
            onPress={() => setCameraOn((v) => !v)}
          />
        </View>
      </Card>

      <Card>
        <Text variant="h2">Type it instead</Text>
        <Row>
          <View style={{ flex: 1 }}>
            <Input
              value={text}
              onChangeText={(t) => setText(t.toUpperCase())}
              autoCapitalize="characters"
              placeholder="Number plate or booking code"
              returnKeyType="go"
              onSubmitEditing={() => {
                void gate.scan(text, direction);
                setText('');
              }}
            />
          </View>
          <Button
            title={direction === 'ENTRY' ? 'Check in' : 'Check out'}
            loading={gate.busy}
            onPress={() => {
              void gate.scan(text, direction);
              setText('');
            }}
          />
        </Row>
      </Card>
    </Screen>
  );
}

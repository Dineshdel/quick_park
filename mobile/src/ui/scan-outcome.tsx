import type { ChargeBreakdownDto } from '@qp/types';
import { formatPlate } from '@qp/validation';
import { useState } from 'react';
import { View } from 'react-native';
import { fmtDur, fmtTime, formatRupees } from '../lib/format';
import { useGate } from '../lib/gate';
import { useDialog } from './dialog';
import { Button, Card, Field, Input, KV, Notice, Row, Select, Text } from './kit';
import { useTheme } from './theme';

/** How the check-out amount was worked out: booked until, free grace, stayed extra, hours × rate. */
export function ChargeBreakdown({ c }: { c: ChargeBreakdownDto }) {
  const { theme } = useTheme();
  const graceEnd = new Date(new Date(c.from).getTime() + c.graceMinutes * 60_000).toISOString();
  const daily = c.note?.toLowerCase().includes('daily');
  return (
    <View style={{ backgroundColor: theme.accent, borderRadius: 12, padding: 12 }}>
      {c.kind === 'OVERSTAY' ? (
        <>
          <KV k="Booked until" v={fmtTime(c.from)} />
          <KV k="Free grace" v={`${c.graceMinutes} min (till ${fmtTime(graceEnd)})`} />
          <KV k="Checking out" v={fmtTime(c.until)} />
          <KV k="Stayed extra" v={fmtDur(c.minutes)} />
        </>
      ) : (
        <>
          <KV k="Entered" v={fmtTime(c.from)} />
          <KV k="Checking out" v={fmtTime(c.until)} />
          <KV k="Parked for" v={fmtDur(c.minutes)} />
        </>
      )}
      <KV
        k="Charged"
        v={daily && c.note ? c.note : `${c.hours} h × ${formatRupees(c.ratePerHourPaise)}/h`}
      />
      {c.kind === 'OVERSTAY' && (
        <Text variant="small">Every started hour counts after the free grace.</Text>
      )}
      <KV k="Total" v={formatRupees(c.amountPaise)} strong />
    </View>
  );
}

/** No booking found: offer to let the vehicle in as a walk-in, prefilled from the scan. */
function WalkInForm({
  plateNumber,
  vehicleTypeId,
}: {
  plateNumber: string;
  vehicleTypeId: string | null;
}) {
  const { confirm } = useDialog();
  const { walkIn, busy, place } = useGate();
  const types = place?.capacities ?? [];
  const [plate, setPlate] = useState(plateNumber);
  const [type, setType] = useState(() =>
    vehicleTypeId && types.some((c) => c.vehicleTypeId === vehicleTypeId)
      ? vehicleTypeId
      : (types[0]?.vehicleTypeId ?? ''),
  );
  return (
    <>
      <Text variant="muted">
        No booking for this vehicle. Let it in as a walk-in (paid at exit)?
      </Text>
      <Field label="Number plate">
        <Input
          value={plate}
          onChangeText={(t) => setPlate(t.toUpperCase())}
          autoCapitalize="characters"
        />
      </Field>
      <Field label="Vehicle type">
        <Select
          value={type}
          onChange={setType}
          title="Vehicle type"
          options={types.map((c) => ({ value: c.vehicleTypeId, label: c.vehicleTypeName }))}
        />
      </Field>
      <Button
        title="Check in as walk-in"
        icon="enter-outline"
        loading={busy}
        onPress={async () => {
          if (
            await confirm({
              title: `Check in ${formatPlate(plate)} as a walk-in?`,
              description: 'They pay at the hourly price when they leave.',
              confirmLabel: 'Check in',
            })
          )
            await walkIn(plate, type);
        }}
      />
    </>
  );
}

/** Result of the last scan: welcome / may leave / collect the charge / problem (+ walk-in). */
export function ScanOutcome() {
  const { theme } = useTheme();
  const { confirm } = useDialog();
  const { outcome, collect, sendOnline, busy, place, clearOutcome } = useGate();
  if (!outcome) return null;

  if (outcome.kind === 'error') {
    return (
      <Card style={{ borderColor: theme.danger }}>
        <Text bold color={theme.danger}>
          ✕ {outcome.message}
        </Text>
        {outcome.walkIn && place && (
          // Keyed by the plate so the form starts from this scan's details.
          <WalkInForm
            key={outcome.walkIn.plateNumber}
            plateNumber={outcome.walkIn.plateNumber}
            vehicleTypeId={outcome.walkIn.vehicleTypeId}
          />
        )}
        <Button title="Dismiss" variant="ghost" size="sm" onPress={clearOutcome} />
      </Card>
    );
  }

  const r = outcome.result;
  const due = outcome.kind === 'due';
  return (
    <Card style={{ borderColor: due ? theme.warning : theme.success, borderWidth: 2 }}>
      <Text variant="h2" color={due ? theme.warning : theme.success}>
        {due ? '⚠' : '✓'} {r.message}
      </Text>
      <Text>
        <Text bold>{formatPlate(r.plateNumber)}</Text> · {r.vehicleTypeName}
        {r.customerName ? ` · ${r.customerName}` : ''}
        {r.booking ? ` · ${r.booking.code} until ${fmtTime(r.booking.endAt)}` : ''}
      </Text>
      {r.charges && <ChargeBreakdown c={r.charges} />}
      {due && r.onlineRequest ? (
        <>
          <Notice tone="info">
            {`Waiting for the driver to pay ${formatRupees(r.onlineRequest.amountPaise)} online (sent ${fmtTime(r.onlineRequest.requestedAt)}). This updates by itself.`}
          </Notice>
          <Row>
            <Button
              title="Took cash instead"
              variant="outline"
              loading={busy}
              style={{ flex: 1 }}
              onPress={async () => {
                if (
                  await confirm({
                    title: `Received ${formatRupees(r.amountDuePaise)} in cash?`,
                    description: 'The online request is cancelled and the vehicle is checked out.',
                    confirmLabel: 'Confirm exit',
                  })
                )
                  await collect(r.sessionId, 'CASH');
              }}
            />
            <Button
              title="Send again"
              variant="ghost"
              disabled={busy}
              style={{ flex: 1 }}
              onPress={() => void sendOnline(r.sessionId)}
            />
          </Row>
        </>
      ) : due && r.canPayOnline ? (
        <>
          <Text variant="title">Collect {formatRupees(r.amountDuePaise)}</Text>
          <Text variant="muted">How will they pay?</Text>
          <Row>
            <Button
              title="Cash"
              icon="cash-outline"
              loading={busy}
              style={{ flex: 1 }}
              onPress={async () => {
                if (
                  await confirm({
                    title: `Received ${formatRupees(r.amountDuePaise)} in cash?`,
                    description: 'The vehicle is then checked out.',
                    confirmLabel: 'Confirm exit',
                  })
                )
                  await collect(r.sessionId, 'CASH');
              }}
            />
            <Button
              title="Online"
              icon="phone-portrait-outline"
              variant="outline"
              disabled={busy}
              style={{ flex: 1 }}
              onPress={async () => {
                if (
                  await confirm({
                    title: `Send ${formatRupees(r.amountDuePaise)} to ${r.customerName ?? 'the driver'}?`,
                    description:
                      'They get a notification in Quick Park to pay online. The vehicle is checked out automatically once paid.',
                    confirmLabel: 'Send to driver',
                  })
                )
                  await sendOnline(r.sessionId);
              }}
            />
          </Row>
        </>
      ) : due ? (
        <>
          <Text variant="title">Collect {formatRupees(r.amountDuePaise)}</Text>
          <Row>
            {(['CASH', 'UPI'] as const).map((m) => (
              <Button
                key={m}
                title={m === 'CASH' ? 'Paid in cash' : 'Paid by UPI'}
                variant={m === 'CASH' ? 'primary' : 'outline'}
                loading={busy}
                style={{ flex: 1 }}
                onPress={async () => {
                  if (
                    await confirm({
                      title: `Received ${formatRupees(r.amountDuePaise)} by ${m === 'CASH' ? 'cash' : 'UPI'}?`,
                      description: 'The vehicle is then checked out.',
                      confirmLabel: 'Confirm exit',
                    })
                  )
                    await collect(r.sessionId, m);
                }}
              />
            ))}
          </Row>
        </>
      ) : (
        <Button title="Next vehicle" variant="ghost" size="sm" onPress={clearOutcome} />
      )}
    </Card>
  );
}

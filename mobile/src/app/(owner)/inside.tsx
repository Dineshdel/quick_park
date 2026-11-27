import { formatPlate } from '@qp/validation';
import { useEffect, useState } from 'react';
import { FlatList, View } from 'react-native';
import { fmtTime, formatRupees } from '@/lib/format';
import { useGate } from '@/lib/gate';
import { Badge, Button, Card, Empty, Loading, Row, Text } from '@/ui/kit';
import { ScanOutcome } from '@/ui/scan-outcome';
import { useTheme } from '@/ui/theme';

/** Vehicles inside now, with grace countdown and the live overstay amount; check out from the list. */
export default function Inside() {
  const { theme } = useTheme();
  const gate = useGate();
  // The clock, refreshed every 30 s so "grace: n min left" stays current.
  const [now, setNow] = useState(() => Date.now());
  useEffect(() => {
    const t = setInterval(() => setNow(Date.now()), 30_000);
    return () => clearInterval(t);
  }, []);
  const inside = gate.sessions.filter((s) => !s.exitAt);

  return (
    <FlatList
      style={{ backgroundColor: theme.background }}
      contentContainerStyle={{ padding: 16, gap: 12, paddingBottom: 32 }}
      data={inside}
      keyExtractor={(s) => s.id}
      refreshing={false}
      onRefresh={() => void gate.refreshSessions()}
      ListHeaderComponent={
        <View style={{ gap: 12 }}>
          {gate.place && (
            <Text variant="muted">
              {gate.place.name} · {inside.length} inside
            </Text>
          )}
          <ScanOutcome />
        </View>
      }
      ListEmptyComponent={
        gate.sessionsLoading ? <Loading /> : <Empty icon="car-outline" title="No vehicles inside" />
      }
      renderItem={({ item: s }) => {
        const late = !!s.bookingEndAt && new Date(s.bookingEndAt).getTime() < now;
        const graceLeft =
          late && s.freeUntil && new Date(s.freeUntil).getTime() > now
            ? Math.ceil((new Date(s.freeUntil).getTime() - now) / 60_000)
            : 0;
        return (
          <Card>
            <Row style={{ justifyContent: 'space-between' }}>
              <Text variant="h2">{formatPlate(s.plateNumber)}</Text>
              {s.dueNowPaise > 0 && (
                <Text bold color={theme.warning}>
                  {formatRupees(s.dueNowPaise)} due
                </Text>
              )}
            </Row>
            <Row style={{ flexWrap: 'wrap' }}>
              <Text variant="muted">{s.vehicleTypeName}</Text>
              {s.isWalkIn ? (
                <Badge label="Walk-in" tone="info" />
              ) : (
                <Badge label={s.bookingCode ?? ''} />
              )}
              {graceLeft > 0 ? (
                <Badge label={`Grace: ${graceLeft} min left`} tone="warning" />
              ) : late ? (
                <Badge label="Overstaying" tone="danger" />
              ) : null}
              {s.onlineRequestPaise ? (
                <Badge
                  label={`Online ${formatRupees(s.onlineRequestPaise)} requested`}
                  tone="info"
                />
              ) : null}
            </Row>
            <Text variant="small">
              In {fmtTime(s.entryAt)}
              {s.bookingEndAt ? ` · until ${fmtTime(s.bookingEndAt)}` : ''}
            </Text>
            <Button
              title="Check out"
              icon="exit-outline"
              variant="outline"
              disabled={gate.busy}
              onPress={() => void gate.scan(s.plateNumber, 'EXIT')}
            />
          </Card>
        );
      }}
    />
  );
}

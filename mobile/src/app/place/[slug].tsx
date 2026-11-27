import type { LocationDto, PlanType, ZoneAvailabilityDto } from '@qp/types';
import { PLAN_RULES } from '@qp/validation';
import { useQuery } from '@tanstack/react-query';
import { router, Stack, useLocalSearchParams } from 'expo-router';
import { useMemo, useState } from 'react';
import { View } from 'react-native';
import { api, ApiError } from '@/lib/api';
import { formatRupees } from '@/lib/format';
import { useSession } from '@/lib/hooks';
import { Badge, Button, Card, Empty, KV, Loading, Row, Screen, Segmented, Text } from '@/ui/kit';
import { MapsSheet } from '@/ui/maps-sheet';
import { PhotoGallery } from '@/ui/photos';
import { useTheme } from '@/ui/theme';

const PLAN_ORDER: PlanType[] = ['HOURLY', 'DAILY', 'WEEKLY', 'MONTHLY', 'YEARLY', 'EVENT'];

export default function PlaceScreen() {
  const { slug } = useLocalSearchParams<{ slug: string }>();
  const { theme } = useTheme();
  const s = useSession();
  const [mapsOpen, setMapsOpen] = useState(false);
  const place = useQuery({
    queryKey: ['place', slug],
    queryFn: () => api<LocationDto>(`/parkings/${slug}`),
  });
  const p = place.data;
  const offered = useMemo(() => p?.capacities.filter((c) => c.onlineSlots > 0) ?? [], [p]);
  const [vt, setVt] = useState<string | null>(null);
  const vehicleType = vt ?? offered[0]?.vehicleTypeId ?? '';

  // Free slots for the next hour, per floor, for the chosen vehicle type.
  const window = useMemo(() => {
    const start = new Date();
    return { start: start.toISOString(), end: new Date(start.getTime() + 3_600_000).toISOString() };
  }, []);
  const avail = useQuery({
    queryKey: ['place-avail', p?.id, vehicleType],
    queryFn: () =>
      api<{
        free: number;
        live: { free: number; inside: number; total: number };
        zones: ZoneAvailabilityDto[];
      }>(
        `/parkings/${p!.id}/availability?vehicleType=${vehicleType}&start=${window.start}&end=${window.end}`,
      ),
    enabled: !!p && !!vehicleType,
    refetchInterval: 30_000,
  });

  if (place.isPending) return <Loading />;
  if (!p)
    return (
      <Screen>
        <Empty
          icon="alert-circle-outline"
          title={
            place.error instanceof ApiError && place.error.status === 404
              ? 'This place is not available'
              : 'Could not load this place'
          }
        />
      </Screen>
    );

  const plans = PLAN_ORDER.filter((pl) => p.prices.some((x) => x.planType === pl && x.isActive));
  const zoneFree = Object.fromEntries((avail.data?.zones ?? []).map((z) => [z.zoneId, z.free]));
  const directions = () => setMapsOpen(true);
  const book = () =>
    s.status === 'authenticated'
      ? router.push({ pathname: '/book/[id]', params: { id: p.id, vehicleType } })
      : router.push('/login');

  return (
    <>
      <Stack.Screen options={{ title: p.name }} />
      <MapsSheet
        open={mapsOpen}
        onClose={() => setMapsOpen(false)}
        lat={p.lat}
        lng={p.lng}
        label={p.name}
      />
      <Screen
        onRefresh={() => void Promise.all([place.refetch(), avail.refetch()])}
        refreshing={place.isRefetching}
      >
        <PhotoGallery photos={p.photos} />
        <View style={{ gap: 6 }}>
          <Text variant="title">{p.name}</Text>
          <Text variant="muted">
            {p.address}, {p.city}
          </Text>
          <Row style={{ flexWrap: 'wrap' }}>
            <Badge label={p.category.name} />
            {p.isFree && <Badge label="Free parking" tone="success" />}
            {p.is24x7 && <Badge label="Open 24×7" tone="info" />}
            {p.isEvent && <Badge label={`Event: ${p.eventName}`} tone="warning" />}
          </Row>
        </View>
        <Row>
          <Button
            title="Directions"
            icon="navigate-outline"
            variant="outline"
            onPress={directions}
            style={{ flex: 1 }}
          />
          <Button
            title="Book now"
            icon="calendar-outline"
            onPress={book}
            style={{ flex: 1 }}
            disabled={!plans.length}
          />
        </Row>
        {p.description ? <Text variant="muted">{p.description}</Text> : null}

        {offered.length > 1 && (
          <Segmented
            value={vehicleType}
            onChange={setVt}
            options={offered.map((c) => ({ value: c.vehicleTypeId, label: c.vehicleTypeName }))}
          />
        )}

        <Card>
          <Row style={{ justifyContent: 'space-between' }}>
            <Text variant="h2">{p.isFree ? 'Free parking' : 'Prices'}</Text>
            {avail.data && (
              <Text bold color={avail.data.live.free ? theme.success : theme.danger}>
                {avail.data.live.free} free now
              </Text>
            )}
          </Row>
          {p.isFree && (
            <Text variant="muted">No charges here. Your booking is confirmed straight away.</Text>
          )}
          {plans.map((pl) => {
            const price = p.prices.find(
              (x) => x.vehicleTypeId === vehicleType && x.planType === pl && x.isActive,
            );
            if (!price) return null;
            return (
              <KV
                key={pl}
                k={PLAN_RULES[pl].label}
                v={p.isFree ? 'Free' : `${formatRupees(price.pricePaise)} / ${PLAN_RULES[pl].unit}`}
              />
            );
          })}
          {!plans.length && <Text variant="muted">Online booking isn’t open here yet.</Text>}
        </Card>

        {p.areas.length > 0 && (
          <Card>
            <Text variant="h2">Floors & areas</Text>
            <Text variant="small">Free slots for the next hour</Text>
            {p.areas.map((a) => {
              const zones = a.zones.filter((z) =>
                z.capacities.some((c) => c.vehicleTypeId === vehicleType && c.onlineSlots > 0),
              );
              if (!zones.length) return null;
              return (
                <View key={a.id} style={{ gap: 6, marginTop: 6 }}>
                  <Text bold>{a.name}</Text>
                  {a.description ? <Text variant="small">{a.description}</Text> : null}
                  {zones.map((z) => {
                    const online =
                      z.capacities.find((c) => c.vehicleTypeId === vehicleType)?.onlineSlots ?? 0;
                    const free = zoneFree[z.id];
                    const used =
                      free === undefined ? 0 : (online - Math.min(free, online)) / online;
                    return (
                      <View key={z.id} style={{ gap: 4, paddingVertical: 4 }}>
                        <Row style={{ justifyContent: 'space-between' }}>
                          <Text>
                            {z.name}
                            {z.tags.length ? (
                              <Text variant="small"> · {z.tags.join(' · ')}</Text>
                            ) : null}
                          </Text>
                          <Text bold color={free === 0 ? theme.danger : theme.success}>
                            {free === undefined
                              ? `${online} bookable`
                              : free === 0
                                ? 'Full'
                                : `${free} free`}
                          </Text>
                        </Row>
                        <View
                          style={{
                            height: 6,
                            borderRadius: 3,
                            backgroundColor: theme.accent,
                            overflow: 'hidden',
                          }}
                        >
                          <View
                            style={{
                              width: `${Math.max(used * 100, 3)}%`,
                              height: 6,
                              backgroundColor:
                                free === 0
                                  ? theme.danger
                                  : used >= 0.8
                                    ? theme.warning
                                    : theme.success,
                            }}
                          />
                        </View>
                      </View>
                    );
                  })}
                </View>
              );
            })}
          </Card>
        )}

        {p.amenities.length > 0 && (
          <Card>
            <Text variant="h2">Amenities</Text>
            <Row style={{ flexWrap: 'wrap' }}>
              {p.amenities.map((a) => (
                <Badge key={a} label={a} />
              ))}
            </Row>
          </Card>
        )}
        {!p.is24x7 && p.openingHours && (
          <Card>
            <Text variant="h2">Opening hours</Text>
            {['Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat', 'Sun'].map((d, i) => {
              const h = p.openingHours![i];
              return <KV key={d} k={d} v={!h || h.closed ? 'Closed' : `${h.open} – ${h.close}`} />;
            })}
          </Card>
        )}
      </Screen>
    </>
  );
}

import type { CategoryDto, Paginated, SearchResultDto } from '@qp/types';
import { useQuery } from '@tanstack/react-query';
import { Image } from 'expo-image';
import * as Location from 'expo-location';
import { router } from 'expo-router';
import { useState } from 'react';
import { FlatList, Pressable, ScrollView, View } from 'react-native';
import { api } from '@/lib/api';
import { fileUrl } from '@/lib/config';
import { formatRupees, planUnit } from '@/lib/format';
import { useVehicleTypes } from '@/lib/hooks';
import { useDialog } from '@/ui/dialog';
import { Badge, Button, Card, Empty, Icon, Input, Loading, Row, Text } from '@/ui/kit';
import { useTheme } from '@/ui/theme';

export default function FindParking() {
  const { theme } = useTheme();
  const { showError } = useDialog();
  const [text, setText] = useState('');
  const [q, setQ] = useState('');
  const [near, setNear] = useState<{ lat: number; lng: number } | null>(null);
  const [locating, setLocating] = useState(false);
  const [category, setCategory] = useState<string | null>(null);
  const [vehicleType, setVehicleType] = useState<string | null>(null);
  const types = useVehicleTypes();
  const cats = useQuery({
    queryKey: ['categories'],
    queryFn: () => api<CategoryDto[]>('/categories'),
    staleTime: 3_600_000,
  });

  const params = new URLSearchParams({
    ...(q && { q }),
    ...(near && { lat: String(near.lat), lng: String(near.lng), radiusKm: '15' }),
    ...(category && { category }),
    ...(vehicleType && { vehicleType }),
  }).toString();
  const res = useQuery({
    queryKey: ['search', params],
    queryFn: () => api<Paginated<SearchResultDto>>(`/parkings/search?${params}`),
  });

  const nearMe = async () => {
    if (near) return setNear(null);
    setLocating(true);
    try {
      const perm = await Location.requestForegroundPermissionsAsync();
      if (!perm.granted) throw new Error('Allow location access to find parking near you.');
      const pos = await Location.getCurrentPositionAsync({ accuracy: Location.Accuracy.Balanced });
      setNear({ lat: pos.coords.latitude, lng: pos.coords.longitude });
    } catch (e) {
      await showError(e, "Couldn't get your location");
    } finally {
      setLocating(false);
    }
  };

  const chip = (label: string, on: boolean, onPress: () => void) => (
    <Pressable
      key={label}
      onPress={onPress}
      style={{
        paddingHorizontal: 14,
        paddingVertical: 8,
        borderRadius: 999,
        borderWidth: 1,
        borderColor: on ? theme.primary : theme.border,
        backgroundColor: on ? theme.primary : theme.card,
      }}
    >
      <Text style={{ fontSize: 13, fontWeight: '600' }} color={on ? theme.primaryText : theme.text}>
        {label}
      </Text>
    </Pressable>
  );

  return (
    <FlatList
      style={{ backgroundColor: theme.background }}
      contentContainerStyle={{ padding: 16, gap: 12, paddingBottom: 32 }}
      data={res.data?.items ?? []}
      keyExtractor={(p) => p.id}
      refreshing={res.isRefetching}
      onRefresh={() => void res.refetch()}
      keyboardShouldPersistTaps="handled"
      ListHeaderComponent={
        <View style={{ gap: 12 }}>
          <Row>
            <View style={{ flex: 1 }}>
              <Input
                value={text}
                onChangeText={setText}
                placeholder="Place, area or city"
                returnKeyType="search"
                onSubmitEditing={() => setQ(text.trim())}
              />
            </View>
            <Button
              title=""
              icon="search"
              onPress={() => setQ(text.trim())}
              style={{ width: 48, paddingHorizontal: 0 }}
            />
          </Row>
          <Button
            title={near ? 'Showing parking near you · tap to clear' : 'Parking near me'}
            icon="navigate-outline"
            variant={near ? 'primary' : 'outline'}
            loading={locating}
            onPress={nearMe}
          />
          <ScrollView
            horizontal
            showsHorizontalScrollIndicator={false}
            contentContainerStyle={{ gap: 8 }}
          >
            {chip('All places', !category, () => setCategory(null))}
            {cats.data
              ?.filter((c) => c.isActive)
              .map((c) =>
                chip(c.name, category === c.id, () => setCategory(category === c.id ? null : c.id)),
              )}
          </ScrollView>
          <ScrollView
            horizontal
            showsHorizontalScrollIndicator={false}
            contentContainerStyle={{ gap: 8 }}
          >
            {chip('Any vehicle', !vehicleType, () => setVehicleType(null))}
            {types.data
              ?.filter((t) => t.isActive)
              .map((t) =>
                chip(t.name, vehicleType === t.id, () =>
                  setVehicleType(vehicleType === t.id ? null : t.id),
                ),
              )}
          </ScrollView>
          {res.data && (
            <Text variant="small">
              {res.data.total} parking place{res.data.total === 1 ? '' : 's'}
            </Text>
          )}
        </View>
      }
      ListEmptyComponent={
        res.isPending ? (
          <Loading />
        ) : res.isError ? (
          <Empty
            icon="cloud-offline-outline"
            title="Search failed"
            text="Pull down to try again."
          />
        ) : (
          <Empty
            icon="location-outline"
            title="No parking found"
            text="Try another place, or clear the filters."
          />
        )
      }
      renderItem={({ item: p }) => (
        <Card
          onPress={() => router.push({ pathname: '/place/[slug]', params: { slug: p.slug } })}
          style={{ padding: 0, overflow: 'hidden', gap: 0 }}
        >
          {p.photoUrl ? (
            <Image
              source={{ uri: fileUrl(p.photoUrl) }}
              style={{ width: '100%', height: 150 }}
              contentFit="cover"
              transition={150}
            />
          ) : (
            <View
              style={{
                height: 70,
                backgroundColor: theme.accent,
                alignItems: 'center',
                justifyContent: 'center',
              }}
            >
              <Icon name="car-sport-outline" size={30} color={theme.muted} />
            </View>
          )}
          <View style={{ padding: 14, gap: 6 }}>
            <Row style={{ justifyContent: 'space-between' }}>
              <Text variant="h2" style={{ flex: 1 }} numberOfLines={1}>
                {p.name}
              </Text>
              {p.distanceKm !== null && <Text variant="small">{p.distanceKm} km</Text>}
            </Row>
            <Text variant="muted" numberOfLines={1}>
              {p.address}, {p.city}
            </Text>
            <Row style={{ flexWrap: 'wrap' }}>
              <Badge label={p.category} />
              {p.isFree ? (
                <Badge label="Free parking" tone="success" />
              ) : (
                p.fromPaise !== null && (
                  <Text bold>
                    from {formatRupees(p.fromPaise)}/{planUnit(p.fromPlan!)}
                  </Text>
                )
              )}
              {p.is24x7 && <Badge label="24×7" tone="info" />}
            </Row>
          </View>
        </Card>
      )}
    />
  );
}

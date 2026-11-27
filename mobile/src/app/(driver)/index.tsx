import type { CategoryDto, Paginated, SearchResultDto } from '@qp/types';
import { useQuery } from '@tanstack/react-query';
import { Image } from 'expo-image';
import * as Location from 'expo-location';
import { router } from 'expo-router';
import { useEffect, useState } from 'react';
import { FlatList, Keyboard, Pressable, StyleSheet, View } from 'react-native';
import { api } from '@/lib/api';
import { fileUrl } from '@/lib/config';
import { formatRupees, planUnit } from '@/lib/format';
import { useVehicleTypes } from '@/lib/hooks';
import { useDialog } from '@/ui/dialog';
import { BrandHeader, HeaderSearch } from '@/ui/brand-header';
import { Badge, Card, Empty, Icon, Loading, Row, Select, shadow, Text } from '@/ui/kit';
import { useTheme } from '@/ui/theme';

export default function FindParking() {
  const { theme } = useTheme();
  const { showError } = useDialog();
  const [text, setText] = useState('');
  const [q, setQ] = useState('');
  const [focused, setFocused] = useState(false);
  const [headerH, setHeaderH] = useState(0);
  // Search as you type: the list (and the suggestions) follow the text after a short pause.
  useEffect(() => {
    const t = setTimeout(() => setQ(text.trim()), 300);
    return () => clearTimeout(t);
  }, [text]);
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

  const categoryOptions = [
    { value: '', label: 'All places' },
    ...(cats.data?.filter((c) => c.isActive).map((c) => ({ value: c.id, label: c.name })) ?? []),
  ];
  const vehicleOptions = [
    { value: '', label: 'Any vehicle' },
    ...(types.data?.filter((t) => t.isActive).map((t) => ({ value: t.id, label: t.name })) ?? []),
  ];

  return (
    <View style={{ flex: 1, backgroundColor: theme.background }}>
      <View onLayout={(e) => setHeaderH(e.nativeEvent.layout.height)}>
        <BrandHeader>
          <HeaderSearch
            value={text}
            onChangeText={setText}
            onSubmit={() => {
              setQ(text.trim());
              Keyboard.dismiss();
            }}
            onFocus={() => setFocused(true)}
            onBlur={() => setFocused(false)}
            placeholder="Search place, area or city"
          />
        </BrandHeader>
      </View>
      {/* Suggestions drop down under the search bar while typing; tap one to open it. */}
      {focused && text.trim().length > 0 && (
        <View
          style={{
            position: 'absolute',
            top: headerH - 4,
            left: 16,
            right: 16,
            zIndex: 20,
            elevation: 20,
            backgroundColor: theme.card,
            borderRadius: 16,
            borderWidth: 1,
            borderColor: theme.border,
            paddingVertical: 6,
            ...shadow(theme, 3),
          }}
        >
          {res.isFetching && !res.data ? (
            <Text variant="small" style={{ padding: 14 }}>
              Searching…
            </Text>
          ) : q !== text.trim() && !res.data?.items.length ? (
            <Text variant="small" style={{ padding: 14 }}>
              Searching…
            </Text>
          ) : !res.data?.items.length ? (
            <Text variant="small" style={{ padding: 14 }}>
              No parking matches “{text.trim()}”
            </Text>
          ) : (
            res.data.items.slice(0, 6).map((p) => (
              <Pressable
                key={p.id}
                onPress={() => {
                  Keyboard.dismiss();
                  router.push({ pathname: '/place/[slug]', params: { slug: p.slug } });
                }}
                style={({ pressed }) => ({
                  flexDirection: 'row',
                  alignItems: 'center',
                  gap: 12,
                  paddingHorizontal: 14,
                  paddingVertical: 10,
                  backgroundColor: pressed ? theme.accent : 'transparent',
                })}
              >
                <Icon name="location-outline" size={18} color={theme.primary} />
                <View style={{ flex: 1 }}>
                  <Text style={{ fontWeight: '700' }} numberOfLines={1}>
                    {p.name}
                  </Text>
                  <Text variant="small" numberOfLines={1}>
                    {p.address}, {p.city}
                  </Text>
                </View>
                <Icon name="arrow-forward" size={16} color={theme.muted} />
              </Pressable>
            ))
          )}
        </View>
      )}
      {/* Filter strip: a lighter shade than the page, like a shop's filter bar */}
      <View
        style={{
          backgroundColor: theme.card,
          paddingHorizontal: 16,
          paddingVertical: 10,
          gap: 10,
          borderBottomWidth: StyleSheet.hairlineWidth,
          borderBottomColor: theme.border,
        }}
      >
        <Pressable
          onPress={nearMe}
          disabled={locating}
          style={({ pressed }) => ({
            flexDirection: 'row',
            alignItems: 'center',
            gap: 8,
            opacity: pressed || locating ? 0.7 : 1,
          })}
        >
          <Icon name={near ? 'navigate' : 'navigate-outline'} size={17} color={theme.primary} />
          <Text style={{ flex: 1, fontWeight: '700', fontSize: 14 }} color={theme.primary}>
            {locating
              ? 'Finding your location…'
              : near
                ? 'Showing parking near you'
                : 'Parking near me'}
          </Text>
          {near && <Text variant="small">Clear ✕</Text>}
        </Pressable>
        <Row gap={10}>
          <View style={{ flex: 1 }}>
            <Select
              icon="grid-outline"
              title="Type of place"
              value={category ?? ''}
              options={categoryOptions}
              onChange={(v) => setCategory(v || null)}
            />
          </View>
          <View style={{ flex: 1 }}>
            <Select
              icon="car-outline"
              title="Vehicle"
              value={vehicleType ?? ''}
              options={vehicleOptions}
              onChange={(v) => setVehicleType(v || null)}
            />
          </View>
        </Row>
      </View>
      <FlatList
        style={{ backgroundColor: theme.background }}
        contentContainerStyle={{ padding: 16, gap: 12, paddingBottom: 32 }}
        data={res.data?.items ?? []}
        keyExtractor={(p) => p.id}
        refreshing={res.isRefetching}
        onRefresh={() => void res.refetch()}
        keyboardShouldPersistTaps="handled"
        ListHeaderComponent={
          res.data ? (
            <Text variant="small">
              {res.data.total} parking place{res.data.total === 1 ? '' : 's'}
            </Text>
          ) : undefined
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
    </View>
  );
}

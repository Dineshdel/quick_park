import DateTimePicker, { DateTimePickerAndroid } from '@react-native-community/datetimepicker';
import type {
  BookingDto,
  LocationDto,
  PlanType,
  QuoteDto,
  SlotAvailabilityDto,
  ZoneAvailabilityDto,
} from '@qp/types';
import { formatPlate, PLAN_RULES } from '@qp/validation';
import { useQuery } from '@tanstack/react-query';
import { router, useLocalSearchParams } from 'expo-router';
import { useMemo, useRef, useState } from 'react';
import { Platform, Pressable, View } from 'react-native';
import { api, errorMessage } from '@/lib/api';
import { fmtDateTime, formatRupees, planUnit } from '@/lib/format';
import { newKey, useVehicles } from '@/lib/hooks';
import { useDialog } from '@/ui/dialog';
import {
  Button,
  Card,
  Empty,
  Field,
  Icon,
  KV,
  Loading,
  Notice,
  Row,
  Screen,
  Select,
  Text,
} from '@/ui/kit';
import { useTheme } from '@/ui/theme';

const ORDER: PlanType[] = ['HOURLY', 'DAILY', 'WEEKLY', 'MONTHLY', 'YEARLY', 'EVENT'];

/** Next quarter hour, at least 15 minutes from now. */
const defaultStart = () => {
  const d = new Date(Date.now() + 15 * 60_000);
  d.setMinutes(Math.ceil(d.getMinutes() / 15) * 15, 0, 0);
  return d;
};

/** Date + time picker: one compact control on iOS, date then time dialogs on Android. */
function StartPicker({ value, onChange }: { value: Date; onChange: (d: Date) => void }) {
  const { theme } = useTheme();
  if (Platform.OS === 'ios') {
    return (
      <DateTimePicker
        value={value}
        mode="datetime"
        display="compact"
        minimumDate={new Date()}
        minuteInterval={5}
        onChange={(_, d) => d && onChange(d)}
        themeVariant={theme.mode}
      />
    );
  }
  const open = () =>
    DateTimePickerAndroid.open({
      value,
      mode: 'date',
      minimumDate: new Date(),
      onChange: (e, date) => {
        if (e.type !== 'set' || !date) return;
        DateTimePickerAndroid.open({
          value: date,
          mode: 'time',
          is24Hour: false,
          onChange: (e2, time) => {
            if (e2.type !== 'set' || !time) return;
            const d = new Date(date);
            d.setHours(time.getHours(), time.getMinutes(), 0, 0);
            onChange(d);
          },
        });
      },
    });
  return (
    <Pressable
      onPress={open}
      style={{
        minHeight: 48,
        borderRadius: 12,
        borderWidth: 1,
        borderColor: theme.fieldBorder,
        backgroundColor: theme.field,
        paddingHorizontal: 14,
        flexDirection: 'row',
        alignItems: 'center',
        gap: 8,
      }}
    >
      <Icon name="calendar-outline" color={theme.muted} />
      <Text style={{ flex: 1 }}>{fmtDateTime(value)}</Text>
      <Text variant="small">Change</Text>
    </Pressable>
  );
}

function Stepper({
  value,
  max,
  onChange,
  unit,
}: {
  value: number;
  max: number;
  onChange: (n: number) => void;
  unit: string;
}) {
  return (
    <Row>
      <Button
        title="−"
        variant="outline"
        onPress={() => onChange(Math.max(1, value - 1))}
        disabled={value <= 1}
        style={{ width: 52 }}
      />
      <Text variant="h2" style={{ flex: 1, textAlign: 'center' }}>
        {value} {unit}
        {value === 1 ? '' : 's'}
      </Text>
      <Button
        title="+"
        variant="outline"
        onPress={() => onChange(Math.min(max, value + 1))}
        disabled={value >= max}
        style={{ width: 52 }}
      />
    </Row>
  );
}

export default function BookScreen() {
  const { id, vehicleType: wantedType } = useLocalSearchParams<{
    id: string;
    vehicleType?: string;
  }>();
  const { theme } = useTheme();
  const { confirm, showError } = useDialog();
  const vehicles = useVehicles();
  const place = useQuery({
    queryKey: ['place-by-id', id],
    queryFn: () => api<LocationDto>(`/parkings/by-id/${id}`),
  });

  // What the user picked; the effective values below fall back to sensible defaults (no effects needed).
  const [pickedVehicle, setPickedVehicle] = useState('');
  const [pickedPlan, setPlanType] = useState<PlanType>('HOURLY');
  const [start, setStart] = useState(defaultStart);
  const [pickedQty, setQuantity] = useState(1);
  const [pickedArea, setAreaIndex] = useState<number | null>(null);
  const [pickedZone, setPickedZone] = useState<string | null>(null);
  const [slotId, setSlotId] = useState<string | null>(null);
  /** A slot belongs to one floor and vehicle: changing either clears it. */
  const setZoneId = (z: string | null) => {
    setPickedZone(z);
    setSlotId(null);
  };
  const setVehicleId = (v: string) => {
    setPickedVehicle(v);
    setSlotId(null);
  };
  const [busy, setBusy] = useState(false);
  const idem = useRef(newKey('book'));

  const p = place.data;
  const vehicleId =
    pickedVehicle ||
    (vehicles.data?.find((v) => v.vehicleType.id === wantedType) ?? vehicles.data?.[0])?.id ||
    '';
  const vehicle = vehicles.data?.find((v) => v.id === vehicleId);

  const plans = useMemo(
    () =>
      p && vehicle
        ? ORDER.filter((pl) =>
            p.prices.some(
              (x) => x.vehicleTypeId === vehicle.vehicleType.id && x.planType === pl && x.isActive,
            ),
          )
        : [],
    [p, vehicle],
  );
  const planType: PlanType = plans.includes(pickedPlan) ? pickedPlan : (plans[0] ?? pickedPlan);
  const quantity = Math.min(pickedQty, PLAN_RULES[planType].maxQty);

  // Floors that take this vehicle type, grouped by area.
  const zones = useMemo(
    () =>
      p && vehicle
        ? p.areas.flatMap((a, ai) =>
            a.zones
              .filter((z) =>
                z.capacities.some(
                  (c) => c.vehicleTypeId === vehicle.vehicleType.id && c.onlineSlots > 0,
                ),
              )
              .map((z) => ({
                ...z,
                areaIndex: ai,
                areaName: a.name,
                named: z.slots.some(
                  (s) => s.vehicleTypeId === vehicle.vehicleType.id && s.isOnline,
                ),
              })),
          )
        : [],
    [p, vehicle],
  );
  // A floor without slots for this vehicle can't be booked: fall back to any floor.
  const zoneId = pickedZone && zones.some((z) => z.id === pickedZone) ? pickedZone : null;
  const areaIndex =
    pickedArea !== null && zones.some((z) => z.areaIndex === pickedArea) ? pickedArea : null;

  const body =
    vehicle && plans.includes(planType)
      ? {
          locationId: id,
          vehicleTypeId: vehicle.vehicleType.id,
          planType,
          startAt: start.toISOString(),
          quantity,
          zoneId,
          slotId,
        }
      : null;
  const quote = useQuery({
    queryKey: ['quote', body],
    queryFn: () => api<QuoteDto>('/parkings/quote', { body }),
    enabled: !!body,
    retry: false,
  });

  const floors = useQuery({
    queryKey: ['zones', id, vehicle?.vehicleType.id, quote.data?.startAt, quote.data?.endAt],
    queryFn: () =>
      api<{ free: number; zones: ZoneAvailabilityDto[] }>(
        `/parkings/${id}/availability?vehicleType=${vehicle!.vehicleType.id}&start=${quote.data!.startAt}&end=${quote.data!.endAt}`,
      ),
    enabled: !!vehicle && !!quote.data && zones.length > 0,
  });
  const floorFree = Object.fromEntries((floors.data?.zones ?? []).map((z) => [z.zoneId, z.free]));
  const zone = zones.find((z) => z.id === zoneId);
  const slots = useQuery({
    queryKey: [
      'slots',
      id,
      zoneId,
      vehicle?.vehicleType.id,
      quote.data?.startAt,
      quote.data?.endAt,
    ],
    queryFn: () =>
      api<{ slots: SlotAvailabilityDto[] }>(
        `/parkings/${id}/slots?vehicleType=${vehicle!.vehicleType.id}&zone=${zoneId}&start=${quote.data!.startAt}&end=${quote.data!.endAt}`,
      ),
    enabled: !!vehicle && !!quote.data && !!zone?.named,
  });

  if (place.isPending || vehicles.isPending) return <Loading />;
  if (!p) return <Empty icon="alert-circle-outline" title="This parking place is not available" />;
  if (!vehicles.data?.length)
    return (
      <Screen>
        <Empty
          icon="car-outline"
          title="Add your vehicle first"
          text="You need a vehicle to book a slot."
          action={
            <Button title="Add a vehicle" onPress={() => router.replace('/(driver)/vehicles')} />
          }
        />
      </Screen>
    );

  const areaOptions = p.areas
    .map((a, i) => ({ i, a }))
    .filter(({ i }) => zones.some((z) => z.areaIndex === i))
    .map(({ i, a }) => {
      const free = zones
        .filter((z) => z.areaIndex === i)
        .reduce((n, z) => n + (floorFree[z.id] ?? 0), 0);
      return {
        value: String(i),
        label: `${a.name}${floors.data ? (free ? ` (${free} free)` : ' (Full)') : ''}`,
      };
    });

  const book = async () => {
    if (!vehicle || !quote.data) return;
    const ok = await confirm(
      p.isFree
        ? {
            title: 'Book this free slot?',
            description: 'No payment needed: your booking is confirmed straight away.',
            confirmLabel: 'Book for free',
          }
        : {
            title: 'Hold this slot and pay?',
            description: `Total ${formatRupees(quote.data.amountPaise)}. The slot is held for you while you pay.`,
            confirmLabel: 'Hold slot & pay',
          },
    );
    if (!ok) return;
    setBusy(true);
    try {
      const b = await api<BookingDto>('/bookings', {
        body: {
          locationId: id,
          vehicleId: vehicle.id,
          planType,
          startAt: start.toISOString(),
          quantity,
          zoneId,
          slotId,
        },
        headers: { 'Idempotency-Key': idem.current },
      });
      router.replace({ pathname: '/booking/[id]', params: { id: b.id } });
    } catch (e) {
      idem.current = newKey('book');
      await showError(e, "Couldn't book this");
    } finally {
      setBusy(false);
    }
  };

  const slotLabel = slots.data?.slots.find((s) => s.id === slotId)?.label;

  return (
    <Screen>
      <Text variant="h2">{p.name}</Text>
      <Card>
        <Field label="Vehicle">
          <Select
            value={vehicleId}
            onChange={setVehicleId}
            title="Vehicle"
            options={vehicles.data.map((v) => ({
              value: v.id,
              label: `${formatPlate(v.plateNumber)} · ${v.vehicleType.name}`,
            }))}
          />
        </Field>
        {!plans.length ? (
          <Notice tone="warning">{`No plans are offered for ${vehicle?.vehicleType.name.toLowerCase() ?? 'this vehicle'}s here.`}</Notice>
        ) : (
          <>
            <Field label="Plan">
              <Select
                value={planType}
                onChange={setPlanType}
                title="Plan"
                options={plans.map((pl) => {
                  const price = p.prices.find(
                    (x) => x.vehicleTypeId === vehicle?.vehicleType.id && x.planType === pl,
                  )!;
                  return {
                    value: pl,
                    label: `${PLAN_RULES[pl].label} · ${p.isFree ? 'Free' : `${formatRupees(price.pricePaise)}/${planUnit(pl)}`}`,
                  };
                })}
              />
            </Field>
            {planType !== 'EVENT' && (
              <>
                <Field label="Start">
                  <StartPicker value={start} onChange={setStart} />
                </Field>
                {PLAN_RULES[planType].maxQty > 1 && (
                  <Field label="How long">
                    <Stepper
                      value={quantity}
                      max={PLAN_RULES[planType].maxQty}
                      onChange={setQuantity}
                      unit={PLAN_RULES[planType].unit}
                    />
                  </Field>
                )}
              </>
            )}
          </>
        )}
      </Card>

      {zones.length > 0 && plans.length > 0 && (
        <Card>
          <Text variant="h2">Where to park</Text>
          <Field label="Parking area">
            <Select
              value={areaIndex === null ? '' : String(areaIndex)}
              title="Parking area"
              onChange={(v) => {
                if (v === 'any') {
                  setAreaIndex(null);
                  return setZoneId(null);
                }
                const i = Number(v);
                setAreaIndex(i);
                const inArea = zones.filter((z) => z.areaIndex === i);
                setZoneId(
                  (inArea.find((z) => (floorFree[z.id] ?? 0) > 0) ?? inArea[0])?.id ?? null,
                );
              }}
              placeholder={`Any area · any floor${floors.data ? ` (${floors.data.free} free)` : ''}`}
              options={[
                {
                  value: 'any',
                  label: `Any area · any floor${floors.data ? ` (${floors.data.free} free)` : ''}`,
                },
                ...areaOptions,
              ]}
            />
          </Field>
          <Field
            label="Floor"
            hint={
              zone?.tags.length
                ? zone.tags.join(' · ')
                : areaIndex === null
                  ? 'Choose an area first, or leave it to us'
                  : undefined
            }
          >
            <Select
              value={zoneId ?? ''}
              title="Floor"
              disabled={areaIndex === null}
              onChange={setZoneId}
              placeholder="Any floor"
              options={zones
                .filter((z) => z.areaIndex === areaIndex)
                .map((z) => ({
                  value: z.id,
                  label: `${z.name}${floors.data ? (floorFree[z.id] ? ` (${floorFree[z.id]} free)` : ' (Full)') : ''}`,
                }))}
            />
          </Field>
          {zone?.named && slots.data && slots.data.slots.length > 0 && (
            <Field
              label="Parking slot"
              hint={`${slots.data.slots.filter((s) => s.free).length} of ${slots.data.slots.length} slots free for this time`}
            >
              <Select
                value={slotId ?? 'auto'}
                title="Parking slot"
                onChange={(v) => setSlotId(v === 'auto' ? null : v)}
                options={[
                  { value: 'auto', label: 'Any free slot (we assign one when you book)' },
                  ...slots.data.slots.map((s) => ({
                    value: s.id,
                    label: `${s.label}${s.free ? '' : ' (Booked)'}`,
                    disabled: !s.free,
                  })),
                ]}
              />
            </Field>
          )}
        </Card>
      )}

      {plans.length > 0 && (
        <Card>
          <Text variant="h2">Summary</Text>
          {quote.isPending && body ? (
            <Loading label="Checking price and slots…" />
          ) : quote.isError ? (
            <Notice tone="danger">{errorMessage(quote.error)}</Notice>
          ) : quote.data ? (
            <>
              <KV k="From" v={fmtDateTime(quote.data.startAt)} />
              <KV k="Until" v={fmtDateTime(quote.data.endAt)} />
              {!p.isFree && (
                <KV
                  k="Price"
                  v={`${formatRupees(quote.data.unitPaise)} × ${quote.data.quantity}`}
                />
              )}
              {zones.length > 0 && (
                <KV k="Floor" v={zone ? `${zone.name} · ${zone.areaName}` : 'Any floor'} />
              )}
              {zone?.named && <KV k="Slot" v={slotLabel ?? 'Any free slot'} />}
              <KV k="Total" v={p.isFree ? 'Free' : formatRupees(quote.data.amountPaise)} strong />
              <Text bold color={quote.data.free ? theme.success : theme.danger}>
                {quote.data.free
                  ? `${quote.data.free} slot${quote.data.free === 1 ? '' : 's'} free for this time`
                  : slotId
                    ? `Slot ${slotLabel ?? ''} is taken for this time: pick another slot`
                    : zoneId
                      ? 'This floor is full for this time'
                      : 'Fully booked for this time'}
              </Text>
            </>
          ) : null}
        </Card>
      )}

      {plans.length > 0 && (
        <View style={{ gap: 8 }}>
          <Button
            title={p.isFree ? 'Book for free' : 'Hold slot & pay'}
            size="lg"
            loading={busy}
            disabled={!quote.data?.free}
            onPress={book}
          />
          <Text variant="small" style={{ textAlign: 'center' }}>
            Arrive on time: hourly and daily bookings not checked in soon after the start are
            released as no-shows.
          </Text>
        </View>
      )}
    </Screen>
  );
}

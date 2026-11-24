'use client';

import type { OwnerLocationDto } from '@qp/types';
import { ArrowLeft, ArrowRight, Building2, Layers, Plus, Trash2, X } from 'lucide-react';
import { useEffect, useState } from 'react';
import { useVehicleTypes } from '@/shared/data/masters';
import { api } from '@/shared/lib/api';
import { cn } from '@/shared/lib/utils';
import { Alert } from '@/shared/ui/alert';
import { Button } from '@/shared/ui/button';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/shared/ui/card';
import { Input } from '@/shared/ui/input';
import { Select } from '@/shared/ui/select';
import { useConfirm } from '@/shared/ui/confirm-dialog';
import { SlotNumbers, type SlotRow } from './slot-numbers';

type Act = (fn: () => Promise<OwnerLocationDto>, ok: string) => Promise<void>;
type Caps = Record<string, { total: string; online: string }>;
interface ZoneRow {
  key: string;
  id?: string;
  name: string;
  level: string;
  tags: string;
  caps: Caps;
  /** Named slots (P01…), all vehicle types; for a type that has them, they set its counts. */
  slots: SlotRow[];
}

/** Counts per vehicle type as saved: named slots override the typed numbers for their type. */
function effectiveCaps(z: ZoneRow): Caps {
  const out: Caps = { ...z.caps };
  for (const vt of new Set(z.slots.map((s) => s.vehicleTypeId))) {
    const list = z.slots.filter((s) => s.vehicleTypeId === vt);
    out[vt] = { total: String(list.length), online: String(list.filter((s) => s.isOnline).length) };
  }
  return out;
}
interface AreaRow {
  key: string;
  id?: string;
  name: string;
  description: string;
  lat: string;
  lng: string;
  zones: ZoneRow[];
}

const k = () => Math.random().toString(36).slice(2);
const zone = (name: string, level: number, tags: string[] = []): ZoneRow => ({
  key: k(),
  name,
  level: String(level),
  tags: tags.join(', '),
  caps: {},
  slots: [],
});
const area = (name: string, zones: ZoneRow[], description = ''): AreaRow => ({
  key: k(),
  name,
  description,
  lat: '',
  lng: '',
  zones,
});

/** Starting layouts by category: names and floors only, the owner fills in the slot numbers. */
function templateFor(category: string): { label: string; areas: AreaRow[] } {
  const c = category.toLowerCase();
  if (c.includes('mall'))
    return {
      label: 'Mall: 3 basements + two-wheeler area',
      areas: [
        area('Main parking', [zone('B1', -1, ['Near lift']), zone('B2', -2), zone('B3', -3)]),
        area('Two-wheeler parking', [zone('Ground', 0, ['Open air'])]),
      ],
    };
  if (
    c.includes('college') ||
    c.includes('institute') ||
    c.includes('school') ||
    c.includes('university')
  )
    return {
      label: 'Campus: separate parking areas',
      areas: [
        area('Main block parking', [zone('Ground', 0)]),
        area('Tech park parking', [zone('B1', -1), zone('Ground', 0)]),
        area(
          'Hostel parking',
          [zone('Ground', 0, ['Residents only'])],
          'Keep online slots at 0 if only for hostel students',
        ),
        area('Stadium parking', [zone('Open ground', 0, ['Open air'])]),
      ],
    };
  if (c.includes('office'))
    return {
      label: 'Office: staff floors + visitor area',
      areas: [
        area(
          'Staff parking',
          [zone('B1', -1, ['Staff only']), zone('B2', -2, ['Staff only'])],
          'Keep online slots at 0 for staff-only floors',
        ),
        area('Visitor parking', [zone('Ground', 0, ['Near entrance'])]),
      ],
    };
  if (c.includes('resident') || c.includes('apartment'))
    return {
      label: 'Apartment: resident + visitor parking',
      areas: [
        area(
          'Resident parking',
          [zone('Stilt', 0, ['Residents only']), zone('B1', -1, ['Residents only'])],
          'Keep online slots at 0: residents have fixed slots',
        ),
        area('Visitor parking', [zone('Ground', 0)]),
      ],
    };
  if (c.includes('hospital'))
    return {
      label: 'Hospital: visitor floors',
      areas: [area('Visitor parking', [zone('Ground', 0, ['Near entrance']), zone('B1', -1)])],
    };
  return { label: 'One parking area', areas: [area('Main parking', [zone('Ground', 0)])] };
}

function fromDto(l: OwnerLocationDto): AreaRow[] {
  return l.areas.map((a) => ({
    key: a.id,
    id: a.id,
    name: a.name,
    description: a.description ?? '',
    lat: a.lat?.toString() ?? '',
    lng: a.lng?.toString() ?? '',
    zones: a.zones.map((z) => ({
      key: z.id,
      id: z.id,
      name: z.name,
      level: String(z.level),
      tags: z.tags.join(', '),
      caps: Object.fromEntries(
        z.capacities.map((c) => [
          c.vehicleTypeId,
          { total: String(c.totalSlots), online: String(c.onlineSlots) },
        ]),
      ),
      slots: z.slots.map((s) => ({
        key: s.id,
        id: s.id,
        label: s.label,
        vehicleTypeId: s.vehicleTypeId,
        isOnline: s.isOnline,
      })),
    })),
  }));
}

/** Sub-places (campus blocks, towers, separate lots) and their floors/zones, each with slots per vehicle type. */
export function LayoutEditor({
  l,
  disabled,
  act,
}: {
  l: OwnerLocationDto;
  disabled: boolean;
  act: Act;
}) {
  const ask = useConfirm();
  const types = useVehicleTypes();
  const [areas, setAreas] = useState<AreaRow[]>(() => fromDto(l));
  const [saving, setSaving] = useState(false);
  const [active, setActive] = useState(0);
  const cur = Math.max(0, Math.min(active, areas.length - 1));
  const addArea = () => {
    setAreas([...areas, withTypesArea(area('', [zone('Ground', 0)]))]);
    setActive(areas.length);
  };
  useEffect(() => setAreas(fromDto(l)), [l]);

  const tpl = templateFor(l.category.name);
  /** New floors start with the vehicle types this place already has slots for; the owner can add or remove more. */
  const placeTypes = l.capacities.filter((c) => c.totalSlots > 0).map((c) => c.vehicleTypeId);
  const withTypes = (z: ZoneRow): ZoneRow =>
    Object.keys(z.caps).length
      ? z
      : { ...z, caps: Object.fromEntries(placeTypes.map((id) => [id, { total: '', online: '' }])) };
  const withTypesArea = (a: AreaRow): AreaRow => ({ ...a, zones: a.zones.map(withTypes) });
  const setArea = (i: number, patch: Partial<AreaRow>) =>
    setAreas((as) => as.map((a, j) => (j === i ? { ...a, ...patch } : a)));
  const setZone = (i: number, zi: number, patch: Partial<ZoneRow>) =>
    setArea(i, { zones: areas[i]!.zones.map((z, j) => (j === zi ? { ...z, ...patch } : z)) });
  const move = <T,>(list: T[], from: number, to: number) => {
    if (to < 0 || to >= list.length) return list;
    const next = [...list];
    const [x] = next.splice(from, 1);
    next.splice(to, 0, x!);
    return next;
  };

  const totals = (zones: ZoneRow[]) =>
    (types.data ?? [])
      .map((t) => ({
        name: t.name,
        total: zones.reduce((n, z) => n + (Number(effectiveCaps(z)[t.id]?.total) || 0), 0),
        online: zones.reduce((n, z) => n + (Number(effectiveCaps(z)[t.id]?.online) || 0), 0),
      }))
      .filter((x) => x.total > 0);

  const save = async (list: AreaRow[], ok: string) => {
    setSaving(true);
    const body = {
      areas: list.map((a) => ({
        ...(a.id ? { id: a.id } : {}),
        name: a.name,
        description: a.description || null,
        lat: a.lat === '' ? null : Number(a.lat),
        lng: a.lng === '' ? null : Number(a.lng),
        zones: a.zones.map((z) => ({
          ...(z.id ? { id: z.id } : {}),
          name: z.name,
          level: Number(z.level) || 0,
          tags: z.tags
            .split(',')
            .map((t) => t.trim())
            .filter(Boolean),
          capacities: Object.entries(z.caps)
            .map(([vehicleTypeId, c]) => ({
              vehicleTypeId,
              totalSlots: Number(c.total) || 0,
              onlineSlots: Number(c.online) || 0,
            }))
            .filter((c) => c.totalSlots > 0 || c.onlineSlots > 0),
          slots: z.slots
            .filter((s) => s.vehicleTypeId in z.caps)
            .map((s) => ({
              ...(s.id ? { id: s.id } : {}),
              label: s.label,
              vehicleTypeId: s.vehicleTypeId,
              isOnline: s.isOnline,
            })),
        })),
      })),
    };
    await act(() => api(`/owner/locations/${l.id}/layout`, { method: 'PUT', body }), ok).catch(
      () => undefined,
    );
    setSaving(false);
  };

  const all = totals(areas.flatMap((a) => a.zones));
  const floorCount = areas.reduce((n, a) => n + a.zones.length, 0);

  return (
    <Card>
      <CardHeader>
        <CardTitle className="flex items-center gap-2 text-lg">
          <Layers className="size-5" aria-hidden /> Floors &amp; areas
        </CardTitle>
        <CardDescription>
          Optional. Split this place into areas (e.g. Tech Park Parking, APJ Parking, Stadium
          Parking) and each area into floors or zones (B1, Ground, Level 4…).
        </CardDescription>
        <ul className="mt-2 grid gap-1 text-xs text-muted-foreground sm:grid-cols-3 sm:gap-3">
          <li className="rounded-md bg-muted/50 px-3 py-2">
            <b className="text-foreground">Customers pick a floor</b> and see its free slots; if it
            is full they get the nearest floors.
          </li>
          <li className="rounded-md bg-muted/50 px-3 py-2">
            <b className="text-foreground">Level</b> orders floors: B2 = −2, Ground = 0, Level 4 =
            4.
          </li>
          <li className="rounded-md bg-muted/50 px-3 py-2">
            <b className="text-foreground">Online = 0</b> keeps a floor for staff or residents only.
            Place totals become the sum of all floors.
          </li>
        </ul>
      </CardHeader>

      <CardContent className="grid gap-5">
        {areas.length === 0 && (
          <Alert>
            This place uses simple slots (set on the Slots &amp; prices tab).{' '}
            <button
              type="button"
              className="font-medium underline"
              disabled={disabled}
              onClick={() => {
                setAreas(tpl.areas.map(withTypesArea));
                setActive(0);
              }}
            >
              Start from a template ({tpl.label})
            </button>{' '}
            or add an area below.
          </Alert>
        )}

        <fieldset disabled={disabled} className="grid gap-5">
          {/* Area tabs */}
          <div
            role="tablist"
            aria-label="Parking areas"
            className="sticky top-[10.25rem] z-30 -mx-6 flex items-end gap-1 overflow-x-auto border-b bg-card/95 px-6 pt-1 backdrop-blur-md lg:top-[7rem]"
          >
            {areas.map((a, i) => (
              <button
                key={a.key}
                type="button"
                role="tab"
                aria-selected={i === cur}
                onClick={() => setActive(i)}
                className={cn(
                  '-mb-px flex shrink-0 items-center gap-2 border-b-2 px-3 py-2 text-sm font-medium whitespace-nowrap transition-colors',
                  i === cur
                    ? 'border-primary text-foreground'
                    : 'border-transparent text-muted-foreground hover:text-foreground',
                )}
              >
                <Building2 className="size-4" aria-hidden />
                {a.name || `Area ${i + 1}`}
                <span
                  className={cn(
                    'rounded-full px-1.5 text-[11px] tabular-nums',
                    i === cur ? 'bg-primary/10 text-primary' : 'bg-muted',
                  )}
                >
                  {a.zones.length}
                </span>
              </button>
            ))}
            <button
              type="button"
              onClick={addArea}
              className="-mb-px flex shrink-0 items-center gap-1 border-b-2 border-transparent px-3 py-2 text-sm font-medium whitespace-nowrap text-primary hover:bg-primary/5"
            >
              <Plus className="size-4" aria-hidden /> Add area
            </button>
          </div>

          {areas.map((a, i) => {
            if (i !== cur) return null;
            const t = totals(a.zones);
            return (
              <section key={a.key} className="overflow-hidden rounded-xl border">
                {/* Area header */}
                <div className="flex items-center gap-3 border-b bg-muted/40 px-4 py-3">
                  <span className="grid size-8 shrink-0 place-items-center rounded-full bg-primary/10 text-sm font-semibold text-primary">
                    {i + 1}
                  </span>
                  <div className="min-w-0 flex-1">
                    <p className="flex items-center gap-1.5 truncate font-semibold">
                      <Building2 className="size-4 shrink-0 text-muted-foreground" aria-hidden />
                      <span className="truncate">{a.name || 'Untitled area'}</span>
                    </p>
                    <p className="truncate text-xs text-muted-foreground">
                      {a.zones.length} {a.zones.length === 1 ? 'floor' : 'floors'}
                      {t.length > 0 &&
                        ` · ${t.map((x) => `${x.name} ${x.total} total / ${x.online} online`).join(' · ')}`}
                    </p>
                  </div>
                  <div className="flex shrink-0 items-center">
                    <Button
                      size="icon"
                      variant="ghost"
                      className="size-8"
                      aria-label="Move area tab left"
                      title="Move tab left"
                      disabled={i === 0}
                      onClick={() => {
                        setAreas(move(areas, i, i - 1));
                        setActive(i - 1);
                      }}
                    >
                      <ArrowLeft />
                    </Button>
                    <Button
                      size="icon"
                      variant="ghost"
                      className="size-8"
                      aria-label="Move area tab right"
                      title="Move tab right"
                      disabled={i === areas.length - 1}
                      onClick={() => {
                        setAreas(move(areas, i, i + 1));
                        setActive(i + 1);
                      }}
                    >
                      <ArrowRight />
                    </Button>
                    <Button
                      size="icon"
                      variant="ghost"
                      className="size-8 text-destructive hover:text-destructive"
                      aria-label="Remove area"
                      title="Remove this area"
                      onClick={async () => {
                        if (
                          !(await ask({
                            title: `Remove ${a.name || 'this area'}?`,
                            description: `Its ${a.zones.length} ${a.zones.length === 1 ? 'floor' : 'floors'} are removed too. Nothing changes until you save.`,
                            confirmLabel: 'Remove area',
                            tone: 'danger',
                          }))
                        )
                          return;
                        setAreas(areas.filter((_, j) => j !== i));
                        setActive(Math.max(0, i - 1));
                      }}
                    >
                      <Trash2 />
                    </Button>
                  </div>
                </div>

                <div className="grid gap-4 p-4">
                  {/* Area details */}
                  <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-[2fr_3fr_9rem_9rem]">
                    <Field label="Area name">
                      <Input
                        value={a.name}
                        placeholder="e.g. Tech Park Parking"
                        onChange={(e) => setArea(i, { name: e.target.value })}
                      />
                    </Field>
                    <Field label="Directions or note (optional)">
                      <Input
                        value={a.description}
                        placeholder="e.g. Enter from Gate 2"
                        onChange={(e) => setArea(i, { description: e.target.value })}
                      />
                    </Field>
                    <Field label="Map pin latitude">
                      <Input
                        type="number"
                        step="any"
                        value={a.lat}
                        placeholder="Same as place"
                        onChange={(e) => setArea(i, { lat: e.target.value })}
                      />
                    </Field>
                    <Field label="Map pin longitude">
                      <Input
                        type="number"
                        step="any"
                        value={a.lng}
                        placeholder="Same as place"
                        onChange={(e) => setArea(i, { lng: e.target.value })}
                      />
                    </Field>
                  </div>

                  {/* Floors */}
                  <div className="grid gap-3">
                    <p className="text-sm font-medium">Floors / zones</p>
                    {a.zones.map((z, zi) => (
                      <div key={z.key} className="grid gap-3 rounded-lg border bg-muted/20 p-3">
                        <div className="flex items-center justify-between gap-2">
                          <span className="text-xs font-semibold uppercase tracking-wide text-muted-foreground">
                            Floor {zi + 1}
                            {z.name && (
                              <span className="normal-case tracking-normal text-foreground">
                                {' '}
                                · {z.name}
                              </span>
                            )}
                          </span>
                          <Button
                            size="sm"
                            variant="ghost"
                            className="h-7 px-2 text-destructive hover:text-destructive"
                            onClick={async () =>
                              (await ask({
                                title: `Remove ${z.name || `floor ${zi + 1}`}?`,
                                description: 'Nothing changes until you save.',
                                confirmLabel: 'Remove floor',
                                tone: 'danger',
                              })) && setArea(i, { zones: a.zones.filter((_, j) => j !== zi) })
                            }
                          >
                            <Trash2 /> Remove
                          </Button>
                        </div>
                        <div className="grid gap-3 sm:grid-cols-[1fr_7rem_2fr]">
                          <Field label="Floor / zone name">
                            <Input
                              value={z.name}
                              placeholder="B1"
                              onChange={(e) => setZone(i, zi, { name: e.target.value })}
                            />
                          </Field>
                          <Field label="Level">
                            <Input
                              type="number"
                              value={z.level}
                              onChange={(e) => setZone(i, zi, { level: e.target.value })}
                            />
                          </Field>
                          <Field label="Tags (comma separated)">
                            <Input
                              value={z.tags}
                              placeholder="Near lift, EV charging, Covered"
                              onChange={(e) => setZone(i, zi, { tags: e.target.value })}
                            />
                          </Field>
                        </div>
                        {(() => {
                          const chosen = (types.data ?? []).filter((vt) => vt.id in z.caps);
                          const remaining = (types.data ?? []).filter((vt) => !(vt.id in z.caps));
                          return (
                            <div className="grid gap-2">
                              {chosen.length > 0 ? (
                                <div className="overflow-x-auto rounded-md border bg-card">
                                  <table className="w-full text-sm">
                                    <thead className="bg-muted/50 text-xs text-muted-foreground">
                                      <tr>
                                        <th className="px-3 py-2 text-left font-medium">
                                          Vehicle type
                                        </th>
                                        <th className="w-32 px-3 py-2 text-left font-medium">
                                          Total slots
                                        </th>
                                        <th className="w-32 px-3 py-2 text-left font-medium">
                                          Bookable online
                                        </th>
                                        <th className="w-12 px-2 py-2" aria-label="Remove" />
                                      </tr>
                                    </thead>
                                    <tbody>
                                      {chosen.map((vt) => {
                                        const c = z.caps[vt.id]!;
                                        const named = z.slots.some(
                                          (s) => s.vehicleTypeId === vt.id,
                                        );
                                        const eff = effectiveCaps(z)[vt.id]!;
                                        const setCap = (patch: Partial<typeof c>) =>
                                          setZone(i, zi, {
                                            caps: { ...z.caps, [vt.id]: { ...c, ...patch } },
                                          });
                                        const over = Number(c.online) > Number(c.total || 0);
                                        return (
                                          <tr key={vt.id} className="border-t">
                                            <td className="px-3 py-1.5 font-medium">{vt.name}</td>
                                            <td className="px-3 py-1.5">
                                              {named ? (
                                                <span
                                                  className="inline-flex h-9 items-center px-1 font-medium tabular-nums"
                                                  title="From the slot numbers below"
                                                >
                                                  {eff.total}
                                                </span>
                                              ) : (
                                                <Input
                                                  type="number"
                                                  min={0}
                                                  aria-label={`${vt.name} total slots on ${z.name}`}
                                                  placeholder="0"
                                                  value={c.total}
                                                  onChange={(e) =>
                                                    setCap({ total: e.target.value })
                                                  }
                                                  className="h-9 w-24 tabular-nums"
                                                />
                                              )}
                                            </td>
                                            <td className="px-3 py-1.5">
                                              {named ? (
                                                <span
                                                  className="inline-flex h-9 items-center px-1 font-medium tabular-nums"
                                                  title="From the slot numbers below"
                                                >
                                                  {eff.online}
                                                </span>
                                              ) : (
                                                <Input
                                                  type="number"
                                                  min={0}
                                                  aria-label={`${vt.name} online slots on ${z.name}`}
                                                  aria-invalid={over || undefined}
                                                  placeholder="0"
                                                  value={c.online}
                                                  onChange={(e) =>
                                                    setCap({ online: e.target.value })
                                                  }
                                                  className="h-9 w-24 tabular-nums"
                                                />
                                              )}
                                            </td>
                                            <td className="px-2 py-1.5 text-right">
                                              <Button
                                                size="icon"
                                                variant="ghost"
                                                className="size-8 text-muted-foreground hover:text-destructive"
                                                aria-label={`Remove ${vt.name} from ${z.name || 'this floor'}`}
                                                onClick={async () =>
                                                  (await ask({
                                                    title: `Remove ${vt.name} from ${z.name || 'this floor'}?`,
                                                    confirmLabel: 'Remove',
                                                    tone: 'danger',
                                                  })) &&
                                                  setZone(i, zi, {
                                                    caps: Object.fromEntries(
                                                      Object.entries(z.caps).filter(
                                                        ([id]) => id !== vt.id,
                                                      ),
                                                    ),
                                                    slots: z.slots.filter(
                                                      (s) => s.vehicleTypeId !== vt.id,
                                                    ),
                                                  })
                                                }
                                              >
                                                <X />
                                              </Button>
                                            </td>
                                          </tr>
                                        );
                                      })}
                                    </tbody>
                                  </table>
                                </div>
                              ) : (
                                <p className="rounded-md border border-dashed bg-card px-3 py-2 text-xs text-muted-foreground">
                                  No vehicle types on this floor yet. Add the ones that park here.
                                </p>
                              )}
                              {chosen.map((vt) => (
                                <SlotNumbers
                                  key={vt.id}
                                  vehicleTypeId={vt.id}
                                  vehicleName={vt.name}
                                  floorName={z.name}
                                  slots={z.slots.filter((s) => s.vehicleTypeId === vt.id)}
                                  allLabels={z.slots.map((s) => s.label)}
                                  onChange={(next) =>
                                    setZone(i, zi, {
                                      slots: [
                                        ...z.slots.filter((s) => s.vehicleTypeId !== vt.id),
                                        ...next,
                                      ],
                                    })
                                  }
                                />
                              ))}
                              {remaining.length > 0 && (
                                <Select
                                  value=""
                                  aria-label={`Add vehicle type to ${z.name || 'this floor'}`}
                                  onChange={(e) =>
                                    e.target.value &&
                                    setZone(i, zi, {
                                      caps: {
                                        ...z.caps,
                                        [e.target.value]: { total: '', online: '' },
                                      },
                                    })
                                  }
                                  className="h-9 w-full sm:w-56"
                                >
                                  <option value="">+ Add vehicle type</option>
                                  {remaining.map((vt) => (
                                    <option key={vt.id} value={vt.id}>
                                      {vt.name}
                                    </option>
                                  ))}
                                </Select>
                              )}
                            </div>
                          );
                        })()}
                      </div>
                    ))}
                    <Button
                      size="sm"
                      variant="outline"
                      className="justify-self-start"
                      onClick={() =>
                        setArea(i, {
                          zones: [
                            ...a.zones,
                            withTypes(
                              zone(
                                '',
                                a.zones.length
                                  ? Math.min(...a.zones.map((z) => Number(z.level) || 0)) - 1
                                  : 0,
                              ),
                            ),
                          ],
                        })
                      }
                    >
                      <Plus /> Add floor / zone
                    </Button>
                  </div>
                </div>
              </section>
            );
          })}

          {all.length > 0 && (
            <div className="rounded-xl border bg-muted/30 p-4">
              <p className="mb-3 text-sm font-semibold">
                Whole place · {areas.length} {areas.length === 1 ? 'area' : 'areas'}, {floorCount}{' '}
                {floorCount === 1 ? 'floor' : 'floors'}
              </p>
              <div className="grid gap-2 sm:grid-cols-2 lg:grid-cols-3">
                {all.map((x) => (
                  <div
                    key={x.name}
                    className="flex items-center justify-between rounded-lg border bg-card px-3 py-2 text-sm"
                  >
                    <span className="font-medium">{x.name}</span>
                    <span className="tabular-nums text-muted-foreground">
                      <b className="text-foreground">{x.total}</b> total ·{' '}
                      <b className="text-foreground">{x.online}</b> online
                    </span>
                  </div>
                ))}
              </div>
            </div>
          )}

          <div className="flex flex-wrap items-center justify-between gap-2 border-t pt-4">
            <div className="flex flex-wrap gap-2">
              {l.areas.length > 0 && (
                <Button
                  variant="ghost"
                  className="text-destructive hover:text-destructive"
                  onClick={async () =>
                    (await ask({
                      title: 'Remove all areas and floors?',
                      description:
                        'The place goes back to simple slots and keeps its current totals. Customers can no longer pick a floor.',
                      confirmLabel: 'Remove all',
                      tone: 'danger',
                    })) && save([], 'Switched back to simple slots.')
                  }
                >
                  Remove all
                </Button>
              )}
            </div>
            <Button
              loading={saving}
              disabled={!areas.length && !l.areas.length}
              onClick={async () =>
                (await ask({
                  title: 'Save floors & areas?',
                  description: `${areas.length} ${areas.length === 1 ? 'area' : 'areas'} with ${floorCount} ${floorCount === 1 ? 'floor' : 'floors'}. Place slot totals are updated to match.`,
                  confirmLabel: 'Save',
                })) &&
                save(
                  areas,
                  areas.length
                    ? 'Floors & areas saved. Place totals updated.'
                    : 'Switched back to simple slots.',
                )
              }
            >
              Save floors &amp; areas
            </Button>
          </div>
        </fieldset>
      </CardContent>
    </Card>
  );
}

function Field({ label, children }: { label: string; children: React.ReactNode }) {
  return (
    <label className="grid content-start gap-1.5">
      <span className="text-xs font-medium text-muted-foreground">{label}</span>
      {children}
    </label>
  );
}

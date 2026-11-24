'use client';

import type { OwnerLocationDto, PlanType } from '@qp/types';
import { PLAN_RULES } from '@qp/validation';
import { useQuery, useQueryClient } from '@tanstack/react-query';
import { ArrowLeft, ExternalLink, Trash2, Upload } from 'lucide-react';
import Link from 'next/link';
import { useParams, useSearchParams } from 'next/navigation';
import { Suspense, useEffect, useRef, useState } from 'react';
import { AvailabilityCalendar } from '@/shared/booking/availability-calendar';
import { useVehicleTypes } from '@/shared/data/masters';
import { api, apiUpload, errorMessage } from '@/shared/lib/api';
import { fmtDateTime, paiseToRupees, rupeesToPaise, toLocalInput } from '@/shared/lib/format';
import { Alert } from '@/shared/ui/alert';
import { StatusPill } from '@/shared/ui/badge';
import { cn } from '@/shared/lib/utils';
import { Badge } from '@/shared/ui/badge';
import { Button } from '@/shared/ui/button';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/shared/ui/card';
import { Input } from '@/shared/ui/input';
import { Select } from '@/shared/ui/select';
import { StickyBar, Tabs } from '@/shared/ui/tabs';
import { LocationForm } from '../../_components/location-form';
import { usePolicies } from '../../_components/use-policies';
import { LayoutEditor } from './layout-editor';
import { ErrorPopup, useConfirm } from '@/shared/ui/confirm-dialog';

type Tab = 'details' | 'floors' | 'slots' | 'blocks' | 'photos' | 'calendar';
const PLANS: PlanType[] = ['HOURLY', 'DAILY', 'WEEKLY', 'MONTHLY', 'YEARLY'];

function LocationManager() {
  const ask = useConfirm();
  const { id } = useParams<{ id: string }>();
  const params = useSearchParams();
  const qc = useQueryClient();
  const key = ['owner-location', id];
  const loc = useQuery({
    queryKey: key,
    queryFn: () => api<OwnerLocationDto>(`/owner/locations/${id}`),
  });
  const [tab, setTab] = useState<Tab>((params.get('tab') as Tab) ?? 'details');
  const [msg, setMsg] = useState<{ ok: boolean; text: string; details?: string[] } | null>(null);
  const [busy, setBusy] = useState(false);
  const policies = usePolicies();

  const set = (l: OwnerLocationDto) => {
    qc.setQueryData(key, l);
    void qc.invalidateQueries({ queryKey: ['owner-locations'] });
  };
  const act = async (fn: () => Promise<OwnerLocationDto>, ok: string) => {
    setMsg(null);
    try {
      set(await fn());
      setMsg({ ok: true, text: ok });
    } catch (e) {
      const details = (e as { details?: { message: string }[] }).details?.map((d) => d.message);
      setMsg({ ok: false, text: errorMessage(e), details });
      throw e;
    }
  };

  if (loc.isPending) return <p className="text-sm text-muted-foreground">Loading…</p>;
  if (loc.isError) return <Alert variant="destructive">Place not found.</Alert>;
  const l = loc.data;
  const editable = l.status !== 'PENDING' && l.status !== 'ARCHIVED';

  return (
    <div className="grid gap-6">
      <div className="flex flex-wrap items-start justify-between gap-3">
        <div className="grid gap-1">
          <div className="flex flex-wrap items-center gap-2">
            <h1 className="text-2xl font-semibold tracking-tight">{l.name}</h1>
            <StatusPill status={l.status} />
          </div>
          <p className="text-sm text-muted-foreground">
            {l.address}, {l.city}
          </p>
          {l.rejectionReason && (
            <p className="text-sm text-destructive">Admin note: {l.rejectionReason}</p>
          )}
        </div>
        <div className="flex flex-wrap gap-2">
          {l.status === 'ACTIVE' && (
            <Button variant="outline" size="sm" asChild>
              <Link href={`/p/${l.slug}`} target="_blank">
                <ExternalLink /> Public page
              </Link>
            </Button>
          )}
          {l.status === 'DRAFT' && (
            <Button
              size="sm"
              loading={busy}
              onClick={async () => {
                if (
                  !(await ask({
                    title: `Submit ${l.name} for approval?`,
                    description: 'Editing is paused until an admin reviews it.',
                    confirmLabel: 'Submit',
                  }))
                )
                  return;
                setBusy(true);
                await act(
                  () => api(`/owner/locations/${id}/submit`, { method: 'POST' }),
                  'Submitted for approval. We will email you when it is reviewed.',
                ).catch(() => undefined);
                setBusy(false);
              }}
            >
              Submit for approval
            </Button>
          )}
        </div>
      </div>
      {l.status === 'PENDING' && (
        <Alert>Under review. Editing is paused until an admin approves or rejects it.</Alert>
      )}
      {msg?.ok && <Alert variant="success">{msg.text}</Alert>}
      <ErrorPopup
        message={
          msg && !msg.ok ? (
            <>
              {msg.text}
              {msg.details && msg.details.length > 0 && (
                <ul className="mt-2 list-disc pl-5">
                  {msg.details.map((d) => (
                    <li key={d}>{d}</li>
                  ))}
                </ul>
              )}
            </>
          ) : null
        }
        onClose={() => setMsg(null)}
      />

      <StickyBar>
        <Tabs
          value={tab}
          onChange={(t) => {
            setTab(t);
            setMsg(null);
          }}
          items={[
            { value: 'details', label: 'Details' },
            {
              value: 'floors',
              label: l.areas.length
                ? `Floors & areas (${l.areas.reduce((n, a) => n + a.zones.length, 0)})`
                : 'Floors & areas',
            },
            { value: 'slots', label: l.isFree ? 'Slots & plans' : 'Slots & prices' },
            { value: 'blocks', label: 'Blocked times' },
            { value: 'photos', label: `Photos (${l.photos.length})` },
            { value: 'calendar', label: 'Calendar' },
          ]}
        />
      </StickyBar>

      {tab === 'details' && (
        <Card>
          <CardContent className="pt-6">
            <fieldset disabled={!editable}>
              <LocationForm
                initial={l}
                policies={policies.data ?? []}
                submitLabel="Save details"
                onSave={(v) =>
                  act(() => api(`/owner/locations/${id}`, { method: 'PATCH', body: v }), 'Saved.')
                }
              />
            </fieldset>
          </CardContent>
        </Card>
      )}
      {tab === 'floors' && <LayoutEditor l={l} disabled={!editable} act={act} />}
      {tab === 'slots' && <SlotsAndPrices l={l} disabled={!editable} act={act} />}
      {tab === 'blocks' && <Blocks l={l} act={act} />}
      {tab === 'photos' && <Photos l={l} act={act} />}
      {tab === 'calendar' && <OwnerCalendar l={l} />}
    </div>
  );
}

type Act = (fn: () => Promise<OwnerLocationDto>, ok: string) => Promise<void>;

function SlotsAndPrices({
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
  type Row = {
    enabled: boolean;
    total: string;
    online: string;
    overstay: string;
    prices: Partial<Record<PlanType, string>>;
  };
  const [rows, setRows] = useState<Record<string, Row>>({});
  const [saving, setSaving] = useState(false);

  useEffect(() => {
    if (!types.data) return;
    const next: Record<string, Row> = {};
    for (const t of types.data) {
      const c = l.capacities.find((x) => x.vehicleTypeId === t.id);
      const prices: Row['prices'] = {};
      for (const p of l.prices.filter((x) => x.vehicleTypeId === t.id && x.isActive))
        prices[p.planType] = l.isFree ? '0' : paiseToRupees(p.pricePaise);
      next[t.id] = {
        enabled: !!c,
        total: String(c?.totalSlots ?? ''),
        online: String(c?.onlineSlots ?? ''),
        overstay: c ? paiseToRupees(c.overstayPerHourPaise) : '',
        prices,
      };
    }
    setRows(next);
  }, [types.data, l]);

  const plans: PlanType[] = l.isEvent ? ['EVENT'] : PLANS;
  /** With floors/zones, slot counts come from them; only overstay and prices are edited here. */
  const zoned = l.areas.length > 0;
  /** Free place: no prices or overstay charges, only which plans (hourly, daily…) can be booked. */
  const free = l.isFree;
  const update = (id: string, patch: Partial<Row>) =>
    setRows((r) => ({ ...r, [id]: { ...r[id]!, ...patch } }));

  const save = async () => {
    if (
      !(await ask({
        title: free ? 'Save slots & plans?' : 'Save slots & prices?',
        description: free
          ? 'Customers can book the ticked plans for free.'
          : 'New prices apply to new bookings; existing bookings keep their price.',
        confirmLabel: 'Save',
      }))
    )
      return;
    setSaving(true);
    const enabled = Object.entries(rows).filter(([, r]) => r.enabled);
    try {
      await act(
        () =>
          api(`/owner/locations/${l.id}/capacity`, {
            method: 'PUT',
            body: {
              items: enabled.map(([vehicleTypeId, r]) => ({
                vehicleTypeId,
                totalSlots: Number(r.total) || 0,
                onlineSlots: Number(r.online) || 0,
                overstayPerHourPaise: free ? 0 : rupeesToPaise(r.overstay || 0),
              })),
            },
          }),
        'Slots saved.',
      );
      await act(
        () =>
          api(`/owner/locations/${l.id}/pricing`, {
            method: 'PUT',
            body: {
              items: enabled.flatMap(([vehicleTypeId, r]) =>
                plans
                  .filter((p) => (free ? r.prices[p] !== undefined : Number(r.prices[p]) > 0))
                  .map((planType) => ({
                    vehicleTypeId,
                    planType,
                    pricePaise: free ? 0 : rupeesToPaise(r.prices[planType]!),
                  })),
              ),
            },
          }),
        free ? 'Slots and plans saved.' : 'Slots and prices saved.',
      );
    } catch {
      /* message shown by act */
    } finally {
      setSaving(false);
    }
  };

  return (
    <Card>
      <CardHeader>
        <CardTitle className="flex flex-wrap items-center gap-2 text-lg">
          {free ? 'Slots & booking plans' : 'Slots & prices'}
          {free && <Badge variant="success">Free parking</Badge>}
        </CardTitle>
        <CardDescription>
          <b>Total</b> = physical slots. <b>Online</b> = how many can be booked in the app; the rest
          are kept for walk-ins.{' '}
          {free ? (
            <>
              This place is <b>free</b>: no prices are shown and bookings need no payment. Tick the
              plans customers can book. (Change this under Details → Parking charges.)
            </>
          ) : (
            <>Prices in ₹ per {l.isEvent ? 'event' : 'unit'}; leave blank to not offer a plan.</>
          )}
          {zoned && (
            <>
              {' '}
              Slot numbers come from the <b>Floors &amp; areas</b> tab; vehicle types are offered
              when a floor has slots for them.
            </>
          )}
        </CardDescription>
      </CardHeader>
      <CardContent className="grid gap-3 overflow-x-auto">
        <fieldset disabled={disabled} className="grid gap-3">
          {types.data?.map((t) => {
            const r = rows[t.id];
            if (!r) return null;
            return (
              <div key={t.id} className="grid gap-3 rounded-lg border p-3">
                <label className="flex items-center gap-2 font-medium">
                  <input
                    type="checkbox"
                    className="size-4"
                    checked={r.enabled}
                    disabled={zoned}
                    onChange={(e) => update(t.id, { enabled: e.target.checked })}
                  />{' '}
                  {t.name}
                </label>
                {r.enabled && (
                  <div
                    className={
                      free
                        ? 'grid gap-3 sm:grid-cols-[repeat(2,minmax(0,10rem))_1fr] sm:items-end'
                        : 'grid gap-3 sm:grid-cols-3 lg:grid-cols-[repeat(3,minmax(0,1fr))_repeat(5,minmax(0,1fr))]'
                    }
                  >
                    <Num
                      label="Total slots"
                      value={r.total}
                      disabled={zoned}
                      onChange={(v) => update(t.id, { total: v })}
                    />
                    <Num
                      label="Online slots"
                      value={r.online}
                      disabled={zoned}
                      onChange={(v) => update(t.id, { online: v })}
                    />
                    {free ? (
                      <fieldset className="grid gap-1 text-sm">
                        <legend className="mb-1 text-xs text-muted-foreground">
                          Can be booked
                        </legend>
                        <div className="flex flex-wrap gap-2">
                          {plans.map((p) => {
                            const on = r.prices[p] !== undefined;
                            return (
                              <label
                                key={p}
                                className={cn(
                                  'flex h-10 cursor-pointer items-center gap-2 rounded-lg border px-3',
                                  on && 'border-primary bg-primary/5',
                                )}
                              >
                                <input
                                  type="checkbox"
                                  className="size-4"
                                  checked={on}
                                  onChange={(e) => {
                                    const next = { ...r.prices };
                                    if (e.target.checked) next[p] = '0';
                                    else delete next[p];
                                    update(t.id, { prices: next });
                                  }}
                                />
                                {PLAN_RULES[p].label}
                              </label>
                            );
                          })}
                        </div>
                      </fieldset>
                    ) : (
                      <>
                        <Num
                          label="Overstay ₹/h"
                          value={r.overstay}
                          onChange={(v) => update(t.id, { overstay: v })}
                        />
                        {plans.map((p) => (
                          <Num
                            key={p}
                            label={`${PLAN_RULES[p].label} ₹`}
                            value={r.prices[p] ?? ''}
                            onChange={(v) => update(t.id, { prices: { ...r.prices, [p]: v } })}
                          />
                        ))}
                      </>
                    )}
                  </div>
                )}
              </div>
            );
          })}
          <Button className="justify-self-start" loading={saving} onClick={save}>
            {free ? 'Save slots & plans' : 'Save slots & prices'}
          </Button>
        </fieldset>
      </CardContent>
    </Card>
  );
}

function Num({
  label,
  value,
  onChange,
  disabled,
}: {
  label: string;
  value: string;
  onChange: (v: string) => void;
  disabled?: boolean;
}) {
  return (
    <label className="grid gap-1 text-xs text-muted-foreground">
      {label}
      <Input
        type="number"
        min={0}
        step="any"
        value={value}
        disabled={disabled}
        onChange={(e) => onChange(e.target.value)}
        className="text-foreground"
      />
    </label>
  );
}

function Blocks({ l, act }: { l: OwnerLocationDto; act: Act }) {
  const ask = useConfirm();
  const [vt, setVt] = useState(l.capacities[0]?.vehicleTypeId ?? '');
  const [start, setStart] = useState(toLocalInput(new Date(Date.now() + 86_400_000)));
  const [end, setEnd] = useState(toLocalInput(new Date(Date.now() + 2 * 86_400_000)));
  const [slots, setSlots] = useState('1');
  const [reason, setReason] = useState('');
  const name = (id: string) =>
    l.capacities.find((c) => c.vehicleTypeId === id)?.vehicleTypeName ?? '';
  if (!l.capacities.length) return <Alert>Add slots first.</Alert>;
  return (
    <div className="grid gap-4 lg:grid-cols-[1fr_360px]">
      <Card>
        <CardHeader>
          <CardTitle className="text-lg">Upcoming blocks</CardTitle>
          <CardDescription>
            Blocked slots can't be booked online (maintenance, private events). Block all online
            slots to close.
          </CardDescription>
        </CardHeader>
        <CardContent className="grid gap-2">
          {l.blocks.length === 0 && <p className="text-sm text-muted-foreground">None.</p>}
          {l.blocks.map((b) => (
            <div key={b.id} className="flex items-center gap-2 rounded-md border px-3 py-2 text-sm">
              <span className="flex-1">
                <b>{b.slots}</b> {name(b.vehicleTypeId)} slot{b.slots === 1 ? '' : 's'} ·{' '}
                {fmtDateTime(b.startAt)} → {fmtDateTime(b.endAt)}
                {b.reason ? ` · ${b.reason}` : ''}
              </span>
              <Button
                size="icon"
                variant="ghost"
                aria-label="Remove block"
                onClick={() =>
                  void ask({
                    title: 'Remove this block?',
                    description: 'These slots can be booked online again.',
                    confirmLabel: 'Remove',
                    tone: 'danger',
                  }).then((ok) => {
                    if (ok)
                      void act(
                        () => api(`/owner/locations/${l.id}/blocks/${b.id}`, { method: 'DELETE' }),
                        'Block removed.',
                      ).catch(() => undefined);
                  })
                }
              >
                <Trash2 />
              </Button>
            </div>
          ))}
        </CardContent>
      </Card>
      <Card>
        <CardContent className="grid gap-3 pt-6">
          <Select value={vt} onChange={(e) => setVt(e.target.value)} aria-label="Vehicle type">
            {l.capacities.map((c) => (
              <option key={c.vehicleTypeId} value={c.vehicleTypeId}>
                {c.vehicleTypeName} ({c.onlineSlots} online)
              </option>
            ))}
          </Select>
          <label className="grid gap-1 text-sm">
            From
            <Input type="datetime-local" value={start} onChange={(e) => setStart(e.target.value)} />
          </label>
          <label className="grid gap-1 text-sm">
            Until
            <Input type="datetime-local" value={end} onChange={(e) => setEnd(e.target.value)} />
          </label>
          <label className="grid gap-1 text-sm">
            Slots
            <Input type="number" min={1} value={slots} onChange={(e) => setSlots(e.target.value)} />
          </label>
          <label className="grid gap-1 text-sm">
            Reason (optional)
            <Input value={reason} onChange={(e) => setReason(e.target.value)} />
          </label>
          <Button
            onClick={async () =>
              (await ask({
                title: `Block ${slots} ${name(vt)} slot${slots === '1' ? '' : 's'}?`,
                description: 'They cannot be booked online during this time.',
                confirmLabel: 'Block slots',
              })) &&
              act(
                () =>
                  api(`/owner/locations/${l.id}/blocks`, {
                    body: {
                      vehicleTypeId: vt,
                      startAt: new Date(start).toISOString(),
                      endAt: new Date(end).toISOString(),
                      slots: Number(slots),
                      reason: reason || null,
                    },
                  }),
                'Block added.',
              ).catch(() => undefined)
            }
          >
            Block slots
          </Button>
        </CardContent>
      </Card>
    </div>
  );
}

function Photos({ l, act }: { l: OwnerLocationDto; act: Act }) {
  const ask = useConfirm();
  const ref = useRef<HTMLInputElement>(null);
  const [busy, setBusy] = useState(false);
  return (
    <Card>
      <CardHeader>
        <CardTitle className="text-lg">Photos</CardTitle>
        <CardDescription>
          Entrance, signboard and inside. JPG, PNG or WebP up to 5 MB, max 10.
        </CardDescription>
      </CardHeader>
      <CardContent className="grid gap-4">
        <div className="grid grid-cols-2 gap-3 sm:grid-cols-4">
          {l.photos.map((p) => (
            <div key={p.id} className="relative">
              <img
                src={p.url}
                alt="Parking place"
                className="aspect-[4/3] w-full rounded-md object-cover"
              />
              <Button
                size="icon"
                variant="destructive"
                className="absolute top-1 right-1 size-8"
                aria-label="Delete photo"
                onClick={() =>
                  void ask({
                    title: 'Delete this photo?',
                    description: 'This cannot be undone.',
                    confirmLabel: 'Delete',
                    tone: 'danger',
                  }).then((ok) => {
                    if (ok)
                      void act(
                        () => api(`/owner/locations/${l.id}/photos/${p.id}`, { method: 'DELETE' }),
                        'Photo removed.',
                      ).catch(() => undefined);
                  })
                }
              >
                <Trash2 />
              </Button>
            </div>
          ))}
        </div>
        <input
          ref={ref}
          type="file"
          accept="image/jpeg,image/png,image/webp"
          className="hidden"
          onChange={async (e) => {
            const f = e.target.files?.[0];
            if (!f) return;
            setBusy(true);
            const fd = new FormData();
            fd.append('file', f);
            await act(() => apiUpload(`/owner/locations/${l.id}/photos`, fd), 'Photo added.').catch(
              () => undefined,
            );
            setBusy(false);
            if (ref.current) ref.current.value = '';
          }}
        />
        <Button
          variant="outline"
          className="justify-self-start"
          loading={busy}
          disabled={l.photos.length >= 10}
          onClick={() => ref.current?.click()}
        >
          <Upload /> Add photo
        </Button>
      </CardContent>
    </Card>
  );
}

function OwnerCalendar({ l }: { l: OwnerLocationDto }) {
  const [vt, setVt] = useState(l.capacities.find((c) => c.onlineSlots > 0)?.vehicleTypeId ?? '');
  if (l.status !== 'ACTIVE')
    return <Alert>The availability calendar works once the place is approved.</Alert>;
  if (!vt) return <Alert>Add online slots first.</Alert>;
  return (
    <Card>
      <CardHeader className="gap-3">
        <CardTitle className="text-lg">Availability</CardTitle>
        <Tabs
          value={vt}
          onChange={setVt}
          items={l.capacities
            .filter((c) => c.onlineSlots > 0)
            .map((c) => ({ value: c.vehicleTypeId, label: c.vehicleTypeName }))}
        />
      </CardHeader>
      <CardContent className="max-w-md">
        <AvailabilityCalendar locationId={l.id} vehicleTypeId={vt} />
      </CardContent>
    </Card>
  );
}

export default function LocationPage() {
  return (
    <div className="mx-auto grid max-w-6xl gap-4 px-4 py-8">
      <Button variant="ghost" size="sm" asChild className="justify-self-start">
        <Link href="/parking-owner/locations">
          <ArrowLeft /> My places
        </Link>
      </Button>
      <Suspense>
        <LocationManager />
      </Suspense>
    </div>
  );
}

'use client';

import { zodResolver } from '@hookform/resolvers/zod';
import { AMENITIES, type CancellationPolicyDto, type OwnerLocationDto } from '@qp/types';
import { locationCreateSchema, type LocationCreateInput } from '@qp/validation';
import { LocateFixed } from 'lucide-react';
import { useState } from 'react';
import { Controller, useFieldArray, useForm } from 'react-hook-form';
import type { z } from 'zod';
import { useCategories } from '@/shared/data/masters';
import { FormField } from '@/shared/forms/form-field';
import { applyApiError } from '@/shared/lib/form-errors';
import { toLocalInput } from '@/shared/lib/format';
import { Map } from '@/shared/maps/map';
import { PlaceSearchInput } from '@/shared/search/place-search-input';
import { Button } from '@/shared/ui/button';
import { Input } from '@/shared/ui/input';
import { Select, Textarea } from '@/shared/ui/select';
import { cn } from '@/shared/lib/utils';
import { ErrorPopup, useConfirm } from '@/shared/ui/confirm-dialog';

const DAYS = ['Monday', 'Tuesday', 'Wednesday', 'Thursday', 'Friday', 'Saturday', 'Sunday'];
type FormOut = z.output<typeof locationCreateSchema>;
type FormIn = LocationCreateInput & { eventStartLocal?: string; eventEndLocal?: string };

const defaults = (l?: OwnerLocationDto): FormIn => ({
  categoryId: l?.category.id ?? '',
  cancellationPolicyId: l?.cancellationPolicy?.id ?? null,
  name: l?.name ?? '',
  description: l?.description ?? '',
  address: l?.address ?? '',
  city: l?.city ?? '',
  state: l?.state ?? '',
  pincode: l?.pincode ?? '',
  lat: l?.lat ?? 13.0827,
  lng: l?.lng ?? 80.2707,
  is24x7: l?.is24x7 ?? false,
  openingHours:
    l?.openingHours ??
    Array.from({ length: 7 }, () => ({ open: '08:00', close: '22:00', closed: false })),
  amenities: l?.amenities ?? [],
  maxAdvanceDays: l?.maxAdvanceDays ?? 30,
  isEvent: l?.isEvent ?? false,
  isFree: l?.isFree ?? false,
  eventName: l?.eventName ?? '',
  eventStartAt: l?.eventStartAt ? toLocalInput(new Date(l.eventStartAt)) : null,
  eventEndAt: l?.eventEndAt ? toLocalInput(new Date(l.eventEndAt)) : null,
});

/** Create / edit a parking place: details, map pin, opening hours, amenities, event fields. */
export function LocationForm({
  initial,
  policies,
  onSave,
  submitLabel,
}: {
  initial?: OwnerLocationDto;
  policies: CancellationPolicyDto[];
  onSave: (v: FormOut) => Promise<unknown>;
  submitLabel: string;
}) {
  const ask = useConfirm();
  const cats = useCategories();
  const form = useForm<FormIn, unknown, FormOut>({
    resolver: zodResolver(locationCreateSchema) as never,
    defaultValues: defaults(initial),
  });
  const hours = useFieldArray({ control: form.control, name: 'openingHours' as never });
  const { errors, isSubmitting } = form.formState;
  const [lookup, setLookup] = useState('');
  const lat = form.watch('lat');
  const lng = form.watch('lng');
  const is24 = form.watch('is24x7');
  const isEvent = form.watch('isEvent');
  const isFree = form.watch('isFree');

  const onSubmit = form.handleSubmit(async (values) => {
    if (
      !(await ask({
        title: `${submitLabel}?`,
        description: initial
          ? 'Your changes to this place will be saved.'
          : 'The new place will be created and sent for admin approval.',
        confirmLabel: submitLabel,
      }))
    )
      return;
    try {
      await onSave(values);
    } catch (e) {
      applyApiError(e, form.setError);
    }
  });

  return (
    <form onSubmit={onSubmit} className="grid gap-6" noValidate>
      <ErrorPopup message={errors.root?.message} onClose={() => form.clearErrors('root')} />
      <div className="grid gap-4 sm:grid-cols-2">
        <FormField label="Name" error={errors.name?.message}>
          <Input {...form.register('name')} placeholder="e.g. Phoenix Mall Basement Parking" />
        </FormField>
        <FormField label="Category" error={errors.categoryId?.message}>
          <Select {...form.register('categoryId')}>
            <option value="">Choose…</option>
            {cats.data?.map((c) => (
              <option key={c.id} value={c.id}>
                {c.name}
              </option>
            ))}
          </Select>
        </FormField>
        <div className="sm:col-span-2">
          <FormField
            label="Description"
            error={errors.description?.message}
            hint="Entrance, height limits, landmarks…"
          >
            <Textarea {...form.register('description')} />
          </FormField>
        </div>
        <div className="grid gap-1.5 sm:col-span-2">
          <p className="text-sm font-medium">Find your parking on the map</p>
          <PlaceSearchInput
            value={lookup}
            onChange={setLookup}
            parkings={false}
            placeholder="Search building, street or landmark"
            onPlace={(pl) => {
              const opts = { shouldDirty: true, shouldValidate: true };
              form.setValue('lat', Number(pl.lat.toFixed(6)), opts);
              form.setValue('lng', Number(pl.lng.toFixed(6)), opts);
              if (pl.address) form.setValue('address', pl.address.slice(0, 300), opts);
              if (pl.city) form.setValue('city', pl.city, opts);
              if (pl.state) form.setValue('state', pl.state, opts);
              if (/^\d{6}$/.test(pl.pincode)) form.setValue('pincode', pl.pincode, opts);
            }}
          />
          <p className="text-xs text-muted-foreground">
            Fills the address and moves the pin. Then drag the pin to the exact entrance.
          </p>
        </div>
        <div className="sm:col-span-2">
          <FormField label="Address" error={errors.address?.message}>
            <Input {...form.register('address')} />
          </FormField>
        </div>
        <FormField label="City" error={errors.city?.message}>
          <Input {...form.register('city')} />
        </FormField>
        <div className="grid grid-cols-2 gap-4">
          <FormField label="State" error={errors.state?.message}>
            <Input {...form.register('state')} />
          </FormField>
          <FormField label="Pincode" error={errors.pincode?.message}>
            <Input inputMode="numeric" {...form.register('pincode')} />
          </FormField>
        </div>
      </div>

      <div className="grid gap-2">
        <div className="flex flex-wrap items-center justify-between gap-2">
          <p className="text-sm font-medium">
            Map pin: click the map or drag the pin to the entrance
          </p>
          <Button
            type="button"
            variant="outline"
            size="sm"
            onClick={() =>
              navigator.geolocation?.getCurrentPosition((p) => {
                form.setValue('lat', Number(p.coords.latitude.toFixed(6)), { shouldDirty: true });
                form.setValue('lng', Number(p.coords.longitude.toFixed(6)), { shouldDirty: true });
              })
            }
          >
            <LocateFixed /> Use my location
          </Button>
        </div>
        <Map
          className="h-72"
          center={{ lat: Number(lat), lng: Number(lng) }}
          pick={{ lat: Number(lat), lng: Number(lng) }}
          onPick={(la, ln) => {
            form.setValue('lat', Number(la.toFixed(6)), { shouldDirty: true });
            form.setValue('lng', Number(ln.toFixed(6)), { shouldDirty: true });
          }}
        />
        <p className="text-xs text-muted-foreground">
          {Number(lat).toFixed(5)}, {Number(lng).toFixed(5)}
        </p>
      </div>

      <fieldset className="grid gap-2">
        <legend className="mb-2 text-sm font-medium">Parking charges</legend>
        <div className="grid gap-3 sm:grid-cols-2">
          {(
            [
              {
                free: false,
                title: 'Paid parking',
                text: 'You set prices per hour, day, month… Customers pay online to book.',
              },
              {
                free: true,
                title: 'Free parking',
                text: 'No prices are shown. Customers book a slot for free and it is confirmed straight away.',
              },
            ] as const
          ).map((o) => (
            <label
              key={o.title}
              className={cn(
                'flex cursor-pointer gap-3 rounded-lg border p-3 text-sm transition-colors hover:bg-accent',
                !!isFree === o.free && 'border-primary ring-2 ring-primary/30',
              )}
            >
              <input
                type="radio"
                name="isFree"
                className="mt-0.5 size-4"
                checked={!!isFree === o.free}
                onChange={() => form.setValue('isFree', o.free, { shouldDirty: true })}
              />
              <span className="grid gap-0.5">
                <b>{o.title}</b>
                <span className="text-muted-foreground">{o.text}</span>
              </span>
            </label>
          ))}
        </div>
      </fieldset>

      <div className="grid gap-3">
        <label className="flex items-center gap-2 text-sm font-medium">
          <input type="checkbox" className="size-4" {...form.register('is24x7')} /> Open 24×7
        </label>
        {!is24 && (
          <div className="grid gap-2 rounded-lg border p-3">
            {hours.fields.map((f, i) => (
              <div
                key={f.id}
                className="grid grid-cols-[100px_1fr_1fr_auto] items-center gap-2 text-sm"
              >
                <span>{DAYS[i]}</span>
                <Input
                  type="time"
                  aria-label={`${DAYS[i]} opens`}
                  {...form.register(`openingHours.${i}.open` as const)}
                />
                <Input
                  type="time"
                  aria-label={`${DAYS[i]} closes`}
                  {...form.register(`openingHours.${i}.close` as const)}
                />
                <label className="flex items-center gap-1">
                  <input type="checkbox" {...form.register(`openingHours.${i}.closed` as const)} />{' '}
                  Closed
                </label>
              </div>
            ))}
            {errors.openingHours && (
              <p className="text-sm text-destructive">
                Check the opening hours: closing must be after opening.
              </p>
            )}
          </div>
        )}
      </div>

      <div className="grid gap-2">
        <p className="text-sm font-medium">Amenities</p>
        <Controller
          control={form.control}
          name="amenities"
          render={({ field }) => (
            <div className="flex flex-wrap gap-2">
              {AMENITIES.map((a) => {
                const on = (field.value ?? []).includes(a);
                return (
                  <button
                    type="button"
                    key={a}
                    aria-pressed={on}
                    onClick={() =>
                      field.onChange(
                        on ? field.value!.filter((x) => x !== a) : [...(field.value ?? []), a],
                      )
                    }
                    className={`rounded-full border px-3 py-1 text-sm ${on ? 'border-primary bg-primary text-primary-foreground' : 'hover:bg-accent'}`}
                  >
                    {a}
                  </button>
                );
              })}
            </div>
          )}
        />
      </div>

      <div className="grid gap-4 sm:grid-cols-2">
        <FormField label="Cancellation policy" hint="Refund rules customers see when booking">
          <Select {...form.register('cancellationPolicyId', { setValueAs: (v) => v || null })}>
            {policies.map((p) => (
              <option key={p.id} value={p.id}>
                {p.name}
                {p.isDefault ? ' (default)' : ''}
              </option>
            ))}
          </Select>
        </FormField>
        <FormField label="Bookable up to (days ahead)" error={errors.maxAdvanceDays?.message}>
          <Input
            type="number"
            min={1}
            max={365}
            {...form.register('maxAdvanceDays', { valueAsNumber: true })}
          />
        </FormField>
      </div>

      <div className="grid gap-3 rounded-lg border p-4">
        <label className="flex items-center gap-2 text-sm font-medium">
          <input type="checkbox" className="size-4" {...form.register('isEvent')} /> This is event
          parking (one flat price for the event, archived when it ends)
        </label>
        {isEvent && (
          <div className="grid gap-4 sm:grid-cols-3">
            <FormField label="Event name" error={errors.eventName?.message}>
              <Input {...form.register('eventName')} />
            </FormField>
            <FormField label="Starts" error={errors.eventStartAt?.message}>
              <Input
                type="datetime-local"
                {...form.register('eventStartAt', {
                  setValueAs: (v) => (v ? new Date(v).toISOString() : null),
                })}
              />
            </FormField>
            <FormField label="Ends" error={errors.eventEndAt?.message}>
              <Input
                type="datetime-local"
                {...form.register('eventEndAt', {
                  setValueAs: (v) => (v ? new Date(v).toISOString() : null),
                })}
              />
            </FormField>
          </div>
        )}
      </div>

      <Button type="submit" loading={isSubmitting} className="justify-self-start">
        {submitLabel}
      </Button>
    </form>
  );
}

'use client';

import { zodResolver } from '@hookform/resolvers/zod';
import { MAX_VEHICLES_PER_USER, type VehicleDto } from '@qp/types';
import { formatPlate, vehicleCreateSchema, type VehicleCreateInput } from '@qp/validation';
import { useMutation, useQueryClient } from '@tanstack/react-query';
import { QrCode } from 'lucide-react';
import Link from 'next/link';
import { useState } from 'react';
import { useForm } from 'react-hook-form';
import type { z } from 'zod';
import { FormField } from '@/shared/forms/form-field';
import { PageShell } from '@/shared/layout/page-shell';
import { Alert } from '@/shared/ui/alert';
import { Button } from '@/shared/ui/button';
import { Card, CardContent, CardHeader, CardTitle } from '@/shared/ui/card';
import { Input } from '@/shared/ui/input';
import { api, ApiError } from '@/shared/lib/api';
import { applyApiError } from '@/shared/lib/form-errors';
import { useVehicles, useVehicleTypes, VEHICLES_KEY } from '../_components/use-vehicles';
import { VehicleIcon } from '../_components/vehicle-icon';
import { ErrorPopup, useConfirm } from '@/shared/ui/confirm-dialog';

type FormOut = z.output<typeof vehicleCreateSchema>;
const EMPTY: VehicleCreateInput = { vehicleTypeId: '', plateNumber: '' };

export default function VehiclesPage() {
  const ask = useConfirm();
  const qc = useQueryClient();
  const vehicles = useVehicles();
  const types = useVehicleTypes();
  const [editing, setEditing] = useState<VehicleDto | null>(null);
  const [notice, setNotice] = useState<string | null>(null);
  const [rowError, setRowError] = useState<string | null>(null);

  const form = useForm<VehicleCreateInput, unknown, FormOut>({
    resolver: zodResolver(vehicleCreateSchema),
    defaultValues: EMPTY,
  });
  const { errors, isSubmitting } = form.formState;

  const startEdit = (v: VehicleDto | null) => {
    setEditing(v);
    setNotice(null);
    form.reset(
      v ? { vehicleTypeId: v.vehicleType.id, plateNumber: formatPlate(v.plateNumber) } : EMPTY,
    );
  };

  const onSubmit = form.handleSubmit(async (values) => {
    if (
      !(await ask({
        title: editing ? 'Save vehicle changes?' : `Add ${values.plateNumber}?`,
        confirmLabel: editing ? 'Save' : 'Add vehicle',
      }))
    )
      return;
    try {
      if (editing) {
        await api(`/vehicles/${editing.id}`, { method: 'PATCH', body: values });
        setNotice(`Saved ${formatPlate(values.plateNumber)}.`);
      } else {
        await api('/vehicles', { body: values });
        setNotice(`Added ${formatPlate(values.plateNumber)}. Print its QR sticker from the list.`);
      }
      setEditing(null);
      form.reset(EMPTY);
      await qc.invalidateQueries({ queryKey: VEHICLES_KEY });
    } catch (e) {
      applyApiError(e, form.setError);
    }
  });

  const remove = useMutation({
    mutationFn: (v: VehicleDto) => api(`/vehicles/${v.id}`, { method: 'DELETE' }),
    onMutate: () => setRowError(null),
    onError: (e) => setRowError(e instanceof ApiError ? e.message : 'Something went wrong'),
    onSuccess: () => qc.invalidateQueries({ queryKey: VEHICLES_KEY }),
  });

  const atLimit = (vehicles.data?.length ?? 0) >= MAX_VEHICLES_PER_USER;

  return (
    <PageShell
      title="My vehicles"
      description="Add the vehicles you park. Each one gets a QR sticker you can print and stick on the windscreen."
    >
      <div className="grid items-start gap-6 lg:grid-cols-[1fr_340px]">
        <div className="grid gap-3">
          <ErrorPopup message={rowError} onClose={() => setRowError(null)} />
          {vehicles.isPending ? (
            <p className="text-sm text-muted-foreground">Loading…</p>
          ) : vehicles.isError ? (
            <Alert variant="destructive">Could not load your vehicles.</Alert>
          ) : vehicles.data.length === 0 ? (
            <Card>
              <CardContent className="py-10 text-center text-sm text-muted-foreground">
                No vehicles yet. Add your first one with the form.
              </CardContent>
            </Card>
          ) : (
            vehicles.data.map((v) => (
              <Card key={v.id}>
                <CardContent className="flex flex-wrap items-center gap-4 py-4">
                  <div className="flex size-11 items-center justify-center rounded-full bg-muted">
                    <VehicleIcon name={v.vehicleType.icon} className="size-5" />
                  </div>
                  <div className="min-w-0 flex-1">
                    <p className="font-mono text-lg font-semibold tracking-wide">
                      {formatPlate(v.plateNumber)}
                    </p>
                    <p className="text-sm text-muted-foreground">{v.vehicleType.name}</p>
                  </div>
                  <div className="flex flex-wrap gap-1">
                    <Button size="sm" variant="outline" asChild>
                      <Link href={`/vehicle-owner/vehicles/${v.id}/sticker`}>
                        <QrCode /> QR sticker
                      </Link>
                    </Button>
                    <Button size="sm" variant="ghost" onClick={() => startEdit(v)}>
                      Edit
                    </Button>
                    <Button
                      size="sm"
                      variant="ghost"
                      className="text-destructive"
                      disabled={remove.isPending}
                      onClick={() => {
                        void ask({
                          title: `Remove ${formatPlate(v.plateNumber)}?`,
                          description: 'Its QR sticker will stop working.',
                          confirmLabel: 'Remove',
                          tone: 'danger',
                        }).then((ok) => {
                          if (ok) void remove.mutate(v);
                        });
                      }}
                    >
                      Remove
                    </Button>
                  </div>
                </CardContent>
              </Card>
            ))
          )}
        </div>

        <Card>
          <CardHeader>
            <CardTitle className="text-lg">{editing ? 'Edit vehicle' : 'Add a vehicle'}</CardTitle>
          </CardHeader>
          <CardContent>
            {atLimit && !editing ? (
              <Alert>
                You can add up to {MAX_VEHICLES_PER_USER} vehicles. Remove one to add another.
              </Alert>
            ) : (
              <form onSubmit={onSubmit} className="grid gap-4" noValidate>
                <ErrorPopup
                  message={errors.root?.message}
                  onClose={() => form.clearErrors('root')}
                />
                {notice && <Alert variant="success">{notice}</Alert>}
                <FormField label="Vehicle type" error={errors.vehicleTypeId?.message}>
                  <select
                    className="h-10 w-full rounded-md border border-input bg-transparent px-3 text-sm outline-none focus-visible:border-ring focus-visible:ring-[3px] focus-visible:ring-ring/50 aria-invalid:border-destructive"
                    disabled={types.isPending}
                    {...form.register('vehicleTypeId')}
                  >
                    <option value="">{types.isPending ? 'Loading…' : 'Choose…'}</option>
                    {types.data?.map((t) => (
                      <option key={t.id} value={t.id}>
                        {t.name}
                      </option>
                    ))}
                  </select>
                </FormField>
                <FormField
                  label="Number plate"
                  error={errors.plateNumber?.message}
                  hint="e.g. TN 09 AB 1234"
                >
                  <Input
                    autoCapitalize="characters"
                    autoComplete="off"
                    className="font-mono uppercase"
                    {...form.register('plateNumber')}
                  />
                </FormField>
                <div className="flex gap-2">
                  <Button type="submit" loading={isSubmitting}>
                    {editing ? 'Save changes' : 'Add vehicle'}
                  </Button>
                  {editing && (
                    <Button type="button" variant="outline" onClick={() => startEdit(null)}>
                      Cancel
                    </Button>
                  )}
                </div>
              </form>
            )}
          </CardContent>
        </Card>
      </div>
    </PageShell>
  );
}

'use client';

import { zodResolver } from '@hookform/resolvers/zod';
import type { PlatformSettingsDto } from '@qp/types';
import { platformSettingsSchema } from '@qp/validation';
import { useQuery, useQueryClient } from '@tanstack/react-query';
import { useEffect, useState } from 'react';
import { useForm } from 'react-hook-form';
import type { z } from 'zod';
import { FormField } from '@/shared/forms/form-field';
import { PageShell } from '@/shared/layout/page-shell';
import { Alert } from '@/shared/ui/alert';
import { Button } from '@/shared/ui/button';
import { Card, CardContent } from '@/shared/ui/card';
import { Input } from '@/shared/ui/input';
import { api } from '@/shared/lib/api';
import { applyApiError } from '@/shared/lib/form-errors';
import { ErrorPopup, useConfirm } from '@/shared/ui/confirm-dialog';

const KEY = ['admin', '/admin/settings'];
type FormIn = z.input<typeof platformSettingsSchema>;
type FormOut = z.output<typeof platformSettingsSchema>;

export default function SettingsPage() {
  const ask = useConfirm();
  const qc = useQueryClient();
  const settings = useQuery({
    queryKey: KEY,
    queryFn: () => api<PlatformSettingsDto>('/admin/settings'),
  });
  const [saved, setSaved] = useState(false);
  const form = useForm<FormIn, unknown, FormOut>({ resolver: zodResolver(platformSettingsSchema) });
  const { errors, isSubmitting, isDirty } = form.formState;

  useEffect(() => {
    if (settings.data) {
      const {
        defaultCommissionPct,
        holdMinutes,
        entryGraceMinutes,
        exitGraceMinutes,
        noShowReleaseMinutes,
        fewLeftThreshold,
      } = settings.data;
      form.reset({
        defaultCommissionPct,
        holdMinutes,
        entryGraceMinutes,
        exitGraceMinutes,
        noShowReleaseMinutes,
        fewLeftThreshold,
      });
    }
  }, [settings.data, form]);

  const onSubmit = form.handleSubmit(async (values) => {
    if (
      !(await ask({
        title: 'Save platform settings?',
        description: 'New commission, hold time and grace rules apply to new bookings right away.',
        confirmLabel: 'Save settings',
      }))
    )
      return;
    setSaved(false);
    try {
      const updated = await api<PlatformSettingsDto>('/admin/settings', {
        method: 'PATCH',
        body: values,
      });
      qc.setQueryData(KEY, updated);
      setSaved(true);
    } catch (e) {
      applyApiError(e, form.setError);
    }
  });

  const num = (name: keyof FormIn) => form.register(name, { valueAsNumber: true });

  return (
    <PageShell title="Platform settings" description="Rules that apply across all parking places.">
      <Card className="max-w-xl">
        <CardContent className="pt-6">
          {settings.isPending ? (
            <p className="text-sm text-muted-foreground">Loading…</p>
          ) : settings.isError ? (
            <Alert variant="destructive">Could not load the settings.</Alert>
          ) : (
            <form onSubmit={onSubmit} className="grid gap-5" noValidate>
              <ErrorPopup message={errors.root?.message} onClose={() => form.clearErrors('root')} />
              {saved && !isDirty && <Alert variant="success">Settings saved.</Alert>}
              <FormField
                label="Default commission (%)"
                error={errors.defaultCommissionPct?.message}
                hint="Platform share of each booking, unless an owner has their own rate."
              >
                <Input
                  type="number"
                  step="0.01"
                  min={0}
                  max={100}
                  {...num('defaultCommissionPct')}
                />
              </FormField>
              <FormField
                label="Payment hold (minutes)"
                error={errors.holdMinutes?.message}
                hint="How long a slot is held while the customer pays."
              >
                <Input type="number" min={1} max={60} {...num('holdMinutes')} />
              </FormField>
              <FormField
                label="Entry grace (minutes)"
                error={errors.entryGraceMinutes?.message}
                hint="How early a vehicle may enter before its booking starts."
              >
                <Input type="number" min={0} max={240} {...num('entryGraceMinutes')} />
              </FormField>
              <FormField
                label="Overstay grace (minutes)"
                error={errors.exitGraceMinutes?.message}
                hint="Free minutes after a booking ends. After that, overstay is charged for every started hour."
              >
                <Input type="number" min={0} max={240} {...num('exitGraceMinutes')} />
              </FormField>
              <FormField
                label="No-show release (minutes)"
                error={errors.noShowReleaseMinutes?.message}
                hint="Hourly and daily bookings whose vehicle hasn't checked in this long after the start are released, freeing the slot. 0 keeps the slot until the booking ends. Passes and events are never released early."
              >
                <Input type="number" min={0} max={1440} {...num('noShowReleaseMinutes')} />
              </FormField>
              <FormField
                label="“Few left” threshold (slots)"
                error={errors.fewLeftThreshold?.message}
                hint="Calendar days at or below this many free slots show as “few left”."
              >
                <Input type="number" min={0} {...num('fewLeftThreshold')} />
              </FormField>
              <div className="flex items-center gap-3">
                <Button type="submit" loading={isSubmitting} disabled={!isDirty}>
                  Save settings
                </Button>
                <span className="text-xs text-muted-foreground">
                  Last changed {new Date(settings.data.updatedAt).toLocaleString()}
                </span>
              </div>
            </form>
          )}
        </CardContent>
      </Card>
    </PageShell>
  );
}

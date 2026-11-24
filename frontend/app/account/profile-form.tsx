'use client';

import { zodResolver } from '@hookform/resolvers/zod';
import { nameSchema } from '@qp/validation';
import { useState } from 'react';
import { useForm } from 'react-hook-form';
import { z } from 'zod';
import { FormField } from '@/shared/forms/form-field';
import { Alert } from '@/shared/ui/alert';
import { Button } from '@/shared/ui/button';
import { Card, CardContent, CardHeader, CardTitle } from '@/shared/ui/card';
import { Input } from '@/shared/ui/input';
import { api, session, type PublicUser } from '@/shared/lib/api';
import { useSession } from '@/shared/lib/auth/use-session';
import { applyApiError } from '@/shared/lib/form-errors';
import { ErrorPopup, useConfirm } from '@/shared/ui/confirm-dialog';

// Form-level schema: an empty phone field means "remove phone".
const schema = z.object({
  name: nameSchema,
  phone: z.union([
    z.literal(''),
    z
      .string()
      .trim()
      .regex(/^\+?[0-9]{10,15}$/, 'Enter a valid phone number'),
  ]),
});

export function ProfileForm() {
  const ask = useConfirm();
  const s = useSession();
  const user = s.status === 'authenticated' ? s.user : null;
  const [saved, setSaved] = useState(false);
  const form = useForm<z.infer<typeof schema>>({
    resolver: zodResolver(schema),
    values: { name: user?.name ?? '', phone: user?.phone ?? '' },
  });
  const { errors, isSubmitting, isDirty } = form.formState;

  const onSubmit = form.handleSubmit(async ({ name, phone }) => {
    if (!(await ask({ title: 'Save your profile?', confirmLabel: 'Save' }))) return;
    setSaved(false);
    try {
      const updated = await api<PublicUser>('/me', {
        method: 'PATCH',
        body: { name, phone: phone || null },
      });
      session.setUser(updated);
      setSaved(true);
    } catch (e) {
      applyApiError(e, form.setError);
    }
  });

  return (
    <Card>
      <CardHeader>
        <CardTitle>Profile</CardTitle>
      </CardHeader>
      <CardContent>
        <form onSubmit={onSubmit} className="grid gap-4" noValidate>
          <ErrorPopup message={errors.root?.message} onClose={() => form.clearErrors('root')} />
          {saved && <Alert variant="success">Saved.</Alert>}
          <FormField label="Email">
            <Input value={user?.email ?? ''} disabled readOnly />
          </FormField>
          <FormField label="Full name" error={errors.name?.message}>
            <Input autoComplete="name" {...form.register('name')} />
          </FormField>
          <FormField label="Phone (optional)" error={errors.phone?.message}>
            <Input
              type="tel"
              autoComplete="tel"
              placeholder="+919876543210"
              {...form.register('phone')}
            />
          </FormField>
          <Button type="submit" loading={isSubmitting} disabled={!isDirty}>
            Save
          </Button>
        </form>
      </CardContent>
    </Card>
  );
}

'use client';

import { zodResolver } from '@hookform/resolvers/zod';
import { adminInviteSchema, type AdminInviteInput } from '@qp/validation';
import { useState } from 'react';
import { useForm } from 'react-hook-form';
import { FormField } from '@/shared/forms/form-field';
import { Alert } from '@/shared/ui/alert';
import { Button } from '@/shared/ui/button';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/shared/ui/card';
import { Input } from '@/shared/ui/input';
import { api } from '@/shared/lib/api';
import { applyApiError } from '@/shared/lib/form-errors';
import { ErrorPopup, useConfirm } from '@/shared/ui/confirm-dialog';

export function InviteAdminForm() {
  const ask = useConfirm();
  const [sent, setSent] = useState<string | null>(null);
  const form = useForm<AdminInviteInput>({
    resolver: zodResolver(adminInviteSchema),
    defaultValues: { email: '' },
  });
  const { errors, isSubmitting } = form.formState;

  const onSubmit = form.handleSubmit(async (values) => {
    if (
      !(await ask({
        title: `Invite ${values.email} as an admin?`,
        description: 'They will get full admin access once they accept the email invite.',
        confirmLabel: 'Send invite',
      }))
    )
      return;
    setSent(null);
    try {
      await api('/admin/invite', { body: values });
      setSent(values.email);
      form.reset();
    } catch (e) {
      applyApiError(e, form.setError);
    }
  });

  return (
    <Card className="max-w-md">
      <CardHeader>
        <CardTitle>Invite an administrator</CardTitle>
        <CardDescription>They get an email link, valid for 72 hours.</CardDescription>
      </CardHeader>
      <CardContent>
        <form onSubmit={onSubmit} className="grid gap-4" noValidate>
          <ErrorPopup message={errors.root?.message} onClose={() => form.clearErrors('root')} />
          {sent && <Alert variant="success">Invitation sent to {sent}.</Alert>}
          <FormField label="Email" error={errors.email?.message}>
            <Input type="email" {...form.register('email')} />
          </FormField>
          <Button type="submit" loading={isSubmitting}>
            Send invitation
          </Button>
        </form>
      </CardContent>
    </Card>
  );
}

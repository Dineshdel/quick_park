'use client';

import { zodResolver } from '@hookform/resolvers/zod';
import { passwordSchema } from '@qp/validation';
import { useState } from 'react';
import { useForm } from 'react-hook-form';
import { z } from 'zod';
import { FormField } from '@/shared/forms/form-field';
import { Alert } from '@/shared/ui/alert';
import { Button } from '@/shared/ui/button';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/shared/ui/card';
import { Input } from '@/shared/ui/input';
import { api, session, type AuthResult } from '@/shared/lib/api';
import { useSession } from '@/shared/lib/auth/use-session';
import { applyApiError } from '@/shared/lib/form-errors';
import { ErrorPopup, useConfirm } from '@/shared/ui/confirm-dialog';

const schema = z
  .object({ currentPassword: z.string(), newPassword: passwordSchema, confirm: z.string() })
  .refine((v) => v.newPassword === v.confirm, {
    path: ['confirm'],
    message: 'Passwords do not match',
  });

export function ChangePasswordForm() {
  const ask = useConfirm();
  const s = useSession();
  const hasPassword = s.status === 'authenticated' && s.user.hasPassword;
  const [saved, setSaved] = useState(false);
  const form = useForm<z.infer<typeof schema>>({
    resolver: zodResolver(schema),
    defaultValues: { currentPassword: '', newPassword: '', confirm: '' },
  });
  const { errors, isSubmitting } = form.formState;

  const onSubmit = form.handleSubmit(async ({ currentPassword, newPassword }) => {
    if (
      !(await ask({
        title: hasPassword ? 'Change your password?' : 'Set a password?',
        description: 'You will use the new password the next time you sign in.',
        confirmLabel: hasPassword ? 'Change password' : 'Set password',
      }))
    )
      return;
    setSaved(false);
    try {
      const r = await api<AuthResult>('/me/password', {
        method: 'PATCH',
        body: { newPassword, ...(hasPassword ? { currentPassword } : {}) },
      });
      session.apply(r);
      form.reset();
      setSaved(true);
    } catch (e) {
      applyApiError(e, form.setError);
    }
  });

  return (
    <Card>
      <CardHeader>
        <CardTitle>{hasPassword ? 'Change password' : 'Set a password'}</CardTitle>
        <CardDescription>
          {hasPassword
            ? 'Other devices will be signed out.'
            : 'Lets you sign in with email as well as Google.'}
        </CardDescription>
      </CardHeader>
      <CardContent>
        <form onSubmit={onSubmit} className="grid gap-4" noValidate>
          <ErrorPopup message={errors.root?.message} onClose={() => form.clearErrors('root')} />
          {saved && <Alert variant="success">Password updated.</Alert>}
          {hasPassword && (
            <FormField label="Current password" error={errors.currentPassword?.message}>
              <Input
                type="password"
                autoComplete="current-password"
                {...form.register('currentPassword')}
              />
            </FormField>
          )}
          <FormField
            label="New password"
            error={errors.newPassword?.message}
            hint="At least 8 characters"
          >
            <Input type="password" autoComplete="new-password" {...form.register('newPassword')} />
          </FormField>
          <FormField label="Confirm new password" error={errors.confirm?.message}>
            <Input type="password" autoComplete="new-password" {...form.register('confirm')} />
          </FormField>
          <Button type="submit" loading={isSubmitting}>
            Update password
          </Button>
        </form>
      </CardContent>
    </Card>
  );
}

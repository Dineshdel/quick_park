'use client';

import { zodResolver } from '@hookform/resolvers/zod';
import { passwordSchema } from '@qp/validation';
import Link from 'next/link';
import { useSearchParams } from 'next/navigation';
import { useState } from 'react';
import { useForm } from 'react-hook-form';
import { z } from 'zod';
import { FormField } from '@/shared/forms/form-field';
import { Alert } from '@/shared/ui/alert';
import { Button } from '@/shared/ui/button';
import { Input } from '@/shared/ui/input';
import { api } from '@/shared/lib/api';
import { applyApiError } from '@/shared/lib/form-errors';
import { ErrorPopup } from '@/shared/ui/confirm-dialog';

const schema = z
  .object({ password: passwordSchema, confirm: z.string() })
  .refine((v) => v.password === v.confirm, {
    path: ['confirm'],
    message: 'Passwords do not match',
  });

export function ResetForm() {
  const token = useSearchParams().get('token') ?? '';
  const [done, setDone] = useState(false);
  const form = useForm<z.infer<typeof schema>>({
    resolver: zodResolver(schema),
    defaultValues: { password: '', confirm: '' },
  });
  const { errors, isSubmitting } = form.formState;

  const onSubmit = form.handleSubmit(async ({ password }) => {
    try {
      await api('/auth/reset-password', { body: { token, password } });
      setDone(true);
    } catch (e) {
      applyApiError(e, form.setError);
    }
  });

  if (done) {
    return (
      <div className="grid gap-4">
        <Alert variant="success">Password updated. You have been signed out everywhere.</Alert>
        <Button asChild>
          <Link href="/login">Sign in</Link>
        </Button>
      </div>
    );
  }
  if (!token) return <Alert variant="destructive">This link is missing its token.</Alert>;

  return (
    <form onSubmit={onSubmit} className="grid gap-4" noValidate>
      <ErrorPopup message={errors.root?.message} onClose={() => form.clearErrors('root')} />
      <FormField label="New password" error={errors.password?.message} hint="At least 8 characters">
        <Input type="password" autoComplete="new-password" {...form.register('password')} />
      </FormField>
      <FormField label="Confirm password" error={errors.confirm?.message}>
        <Input type="password" autoComplete="new-password" {...form.register('confirm')} />
      </FormField>
      <Button type="submit" loading={isSubmitting}>
        Set new password
      </Button>
    </form>
  );
}

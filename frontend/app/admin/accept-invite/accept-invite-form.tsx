'use client';

import { zodResolver } from '@hookform/resolvers/zod';
import { nameSchema, passwordSchema } from '@qp/validation';
import { useRouter, useSearchParams } from 'next/navigation';
import { useForm } from 'react-hook-form';
import { z } from 'zod';
import { FormField } from '@/shared/forms/form-field';
import { Alert } from '@/shared/ui/alert';
import { Button } from '@/shared/ui/button';
import { Input } from '@/shared/ui/input';
import { api, session, type AuthResult } from '@/shared/lib/api';
import { applyApiError } from '@/shared/lib/form-errors';

const schema = z.object({ name: nameSchema, password: passwordSchema });

export function AcceptInviteForm() {
  const token = useSearchParams().get('token') ?? '';
  const router = useRouter();
  const form = useForm<z.infer<typeof schema>>({ resolver: zodResolver(schema), defaultValues: { name: '', password: '' } });
  const { errors, isSubmitting } = form.formState;

  const onSubmit = form.handleSubmit(async (values) => {
    try {
      const r = await api<AuthResult>('/auth/accept-invite', { body: { ...values, token } });
      session.apply(r);
      router.replace('/admin');
    } catch (e) {
      applyApiError(e, form.setError);
    }
  });

  if (!token) return <Alert variant="destructive">This link is missing its token.</Alert>;
  return (
    <form onSubmit={onSubmit} className="grid gap-4" noValidate>
      {errors.root && <Alert variant="destructive">{errors.root.message}</Alert>}
      <FormField label="Your name" error={errors.name?.message}>
        <Input autoComplete="name" {...form.register('name')} />
      </FormField>
      <FormField label="Password" error={errors.password?.message} hint="At least 8 characters">
        <Input type="password" autoComplete="new-password" {...form.register('password')} />
      </FormField>
      <Button type="submit" loading={isSubmitting}>
        Accept invitation
      </Button>
    </form>
  );
}

'use client';

import { zodResolver } from '@hookform/resolvers/zod';
import type { SelfServiceRole } from '@qp/types';
import { registerSchema, type RegisterInput } from '@qp/validation';
import Link from 'next/link';
import { useRouter, useSearchParams } from 'next/navigation';
import { useState } from 'react';
import { Controller, useForm } from 'react-hook-form';
import { GoogleButton } from '@/shared/auth/google-button';
import { RolePicker } from '@/shared/auth/role-picker';
import { FormField } from '@/shared/forms/form-field';
import { Alert } from '@/shared/ui/alert';
import { Button } from '@/shared/ui/button';
import { Input } from '@/shared/ui/input';
import { api, session, type AuthResult } from '@/shared/lib/api';
import { homeFor } from '@/shared/lib/auth/role-home';
import { applyApiError } from '@/shared/lib/form-errors';

export function RegisterForm() {
  const router = useRouter();
  const params = useSearchParams();
  const initialRole: SelfServiceRole = params.get('role') === 'PARKING_OWNER' ? 'PARKING_OWNER' : 'VEHICLE_OWNER';
  const [sentTo, setSentTo] = useState<string | null>(null);
  const [created, setCreated] = useState(false);
  const form = useForm<RegisterInput>({
    resolver: zodResolver(registerSchema),
    defaultValues: { name: '', email: '', password: '', role: initialRole },
  });
  const { errors, isSubmitting } = form.formState;

  const onSubmit = form.handleSubmit(async (values) => {
    try {
      const r = await api<{ verificationRequired?: boolean }>('/auth/register', { body: values });
      if (r.verificationRequired === false) setCreated(true);
      else setSentTo(values.email);
    } catch (e) {
      applyApiError(e, form.setError);
    }
  });

  if (created) {
    return (
      <Alert variant="success">
        Account created.{' '}
        <Link href="/login" className="font-medium underline">
          Sign in now
        </Link>
      </Alert>
    );
  }

  if (sentTo) {
    return (
      <Alert variant="success">
        We sent a verification link to <strong>{sentTo}</strong>. Open it within 24 hours, then sign in.
      </Alert>
    );
  }

  return (
    <div className="grid gap-4">
      <GoogleButton
        onSuccess={async (r: AuthResult) => {
          let user = r.user;
          if (r.needsRole) {
            // New Google account: apply the account type already picked on this form.
            const chosen = await api<AuthResult>('/auth/choose-role', { body: { role: form.getValues('role') } });
            session.apply(chosen);
            user = chosen.user;
          }
          router.replace(homeFor(user.role));
        }}
      />
      <form onSubmit={onSubmit} className="grid gap-4" noValidate>
        {errors.root && <Alert variant="destructive">{errors.root.message}</Alert>}
        <Controller
          control={form.control}
          name="role"
          render={({ field }) => <RolePicker value={field.value} onChange={field.onChange} />}
        />
        <FormField label="Full name" error={errors.name?.message}>
          <Input autoComplete="name" {...form.register('name')} />
        </FormField>
        <FormField label="Email" error={errors.email?.message}>
          <Input type="email" autoComplete="email" {...form.register('email')} />
        </FormField>
        <FormField label="Password" error={errors.password?.message} hint="At least 8 characters">
          <Input type="password" autoComplete="new-password" {...form.register('password')} />
        </FormField>
        <Button type="submit" loading={isSubmitting}>
          Create account
        </Button>
      </form>
      <p className="text-center text-sm text-muted-foreground">
        Already have an account?{' '}
        <Link href="/login" className="text-foreground hover:underline">
          Sign in
        </Link>
      </p>
    </div>
  );
}

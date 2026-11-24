'use client';

import { zodResolver } from '@hookform/resolvers/zod';
import { loginSchema, type LoginInput } from '@qp/validation';
import Link from 'next/link';
import { useRouter, useSearchParams } from 'next/navigation';
import { useState } from 'react';
import { useForm } from 'react-hook-form';
import { GoogleButton } from '@/shared/auth/google-button';
import { FormField } from '@/shared/forms/form-field';
import { Alert } from '@/shared/ui/alert';
import { Button } from '@/shared/ui/button';
import { Input } from '@/shared/ui/input';
import { api, ApiError, session, type AuthResult } from '@/shared/lib/api';
import { homeFor, safeNext } from '@/shared/lib/auth/role-home';
import { applyApiError } from '@/shared/lib/form-errors';
import { ErrorPopup } from '@/shared/ui/confirm-dialog';

export function LoginForm() {
  const router = useRouter();
  const params = useSearchParams();
  const [unverifiedEmail, setUnverifiedEmail] = useState<string | null>(null);
  const [resent, setResent] = useState(false);
  const form = useForm<LoginInput>({
    resolver: zodResolver(loginSchema),
    defaultValues: { email: '', password: '' },
  });
  const { errors, isSubmitting } = form.formState;

  const done = (r: AuthResult) =>
    router.replace(
      r.user.role ? (safeNext(params.get('next')) ?? homeFor(r.user.role)) : '/choose-role',
    );

  const onSubmit = form.handleSubmit(async (values) => {
    setUnverifiedEmail(null);
    try {
      const result = await api<AuthResult>('/auth/login', { body: values });
      session.apply(result);
      done(result);
    } catch (e) {
      if (e instanceof ApiError && e.code === 'EMAIL_NOT_VERIFIED')
        setUnverifiedEmail(values.email);
      applyApiError(e, form.setError);
    }
  });

  return (
    <div className="grid gap-4">
      <GoogleButton onSuccess={done} />
      <form onSubmit={onSubmit} className="grid gap-4" noValidate>
        <ErrorPopup message={errors.root?.message} onClose={() => form.clearErrors('root')} />
        {unverifiedEmail && (
          <Alert>
            {resent ? (
              'We sent a new verification link.'
            ) : (
              <button
                type="button"
                className="underline"
                onClick={async () => {
                  await api('/auth/resend-verification', {
                    body: { email: unverifiedEmail },
                  }).catch(() => undefined);
                  setResent(true);
                }}
              >
                Resend verification email
              </button>
            )}
          </Alert>
        )}
        <FormField label="Email" error={errors.email?.message}>
          <Input type="email" autoComplete="email" {...form.register('email')} />
        </FormField>
        <FormField label="Password" error={errors.password?.message}>
          <Input type="password" autoComplete="current-password" {...form.register('password')} />
        </FormField>
        <Button type="submit" loading={isSubmitting}>
          Sign in
        </Button>
      </form>
      <div className="flex justify-between text-sm">
        <Link href="/forgot-password" className="text-muted-foreground hover:underline">
          Forgot password?
        </Link>
        <Link href="/register" className="hover:underline">
          Create account
        </Link>
      </div>
    </div>
  );
}

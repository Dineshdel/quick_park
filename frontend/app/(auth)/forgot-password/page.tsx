'use client';

import { zodResolver } from '@hookform/resolvers/zod';
import { emailOnlySchema, type EmailOnlyInput } from '@qp/validation';
import Link from 'next/link';
import { useState } from 'react';
import { useForm } from 'react-hook-form';
import { AuthCard } from '@/shared/auth/auth-card';
import { FormField } from '@/shared/forms/form-field';
import { Alert } from '@/shared/ui/alert';
import { Button } from '@/shared/ui/button';
import { Input } from '@/shared/ui/input';
import { api } from '@/shared/lib/api';
import { applyApiError } from '@/shared/lib/form-errors';
import { ErrorPopup } from '@/shared/ui/confirm-dialog';

export default function ForgotPasswordPage() {
  const [message, setMessage] = useState<string | null>(null);
  const form = useForm<EmailOnlyInput>({
    resolver: zodResolver(emailOnlySchema),
    defaultValues: { email: '' },
  });
  const { errors, isSubmitting } = form.formState;

  const onSubmit = form.handleSubmit(async (values) => {
    try {
      setMessage(
        (await api<{ message: string }>('/auth/forgot-password', { body: values })).message,
      );
    } catch (e) {
      applyApiError(e, form.setError);
    }
  });

  return (
    <AuthCard title="Forgot password" description="We will email you a link to set a new password.">
      {message ? (
        <Alert variant="success">{message}. The link is valid for 30 minutes.</Alert>
      ) : (
        <form onSubmit={onSubmit} className="grid gap-4" noValidate>
          <ErrorPopup message={errors.root?.message} onClose={() => form.clearErrors('root')} />
          <FormField label="Email" error={errors.email?.message}>
            <Input type="email" autoComplete="email" {...form.register('email')} />
          </FormField>
          <Button type="submit" loading={isSubmitting}>
            Send reset link
          </Button>
          <Link href="/login" className="text-center text-sm text-muted-foreground hover:underline">
            Back to sign in
          </Link>
        </form>
      )}
    </AuthCard>
  );
}

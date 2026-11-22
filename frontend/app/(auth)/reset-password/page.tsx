import { Suspense } from 'react';
import { AuthCard } from '@/shared/auth/auth-card';
import { ResetForm } from './reset-form';

export default function ResetPasswordPage() {
  return (
    <AuthCard title="Set a new password">
      <Suspense>
        <ResetForm />
      </Suspense>
    </AuthCard>
  );
}

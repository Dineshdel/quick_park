import { Suspense } from 'react';
import { AuthCard } from '@/shared/auth/auth-card';
import { VerifyEmail } from './verify-email';

export default function VerifyEmailPage() {
  return (
    <AuthCard title="Verify email">
      <Suspense>
        <VerifyEmail />
      </Suspense>
    </AuthCard>
  );
}

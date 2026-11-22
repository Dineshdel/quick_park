import type { Metadata } from 'next';
import { Suspense } from 'react';
import { AuthCard } from '@/shared/auth/auth-card';
import { RegisterForm } from './register-form';

export const metadata: Metadata = { title: 'Create account' };

export default function RegisterPage() {
  return (
    <AuthCard title="Create your account" description="Choose how you will use Quick Park">
      <Suspense>
        <RegisterForm />
      </Suspense>
    </AuthCard>
  );
}

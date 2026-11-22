import type { Metadata } from 'next';
import { Suspense } from 'react';
import { AuthCard } from '@/shared/auth/auth-card';
import { LoginForm } from './login-form';

export const metadata: Metadata = { title: 'Sign in' };

export default function LoginPage() {
  return (
    <AuthCard title="Sign in" description="Welcome back to Quick Park">
      <Suspense>
        <LoginForm />
      </Suspense>
    </AuthCard>
  );
}

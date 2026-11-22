import { Suspense } from 'react';
import { AuthCard } from '@/shared/auth/auth-card';
import { AcceptInviteForm } from './accept-invite-form';

export default function AcceptInvitePage() {
  return (
    <AuthCard title="Admin invitation" description="Set up your administrator account.">
      <Suspense>
        <AcceptInviteForm />
      </Suspense>
    </AuthCard>
  );
}

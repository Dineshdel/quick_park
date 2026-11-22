'use client';

import { RequireAuth } from '@/shared/auth/require-auth';
import { PageShell } from '@/shared/layout/page-shell';
import { ChangePasswordForm } from './change-password-form';
import { ProfileForm } from './profile-form';

export default function AccountPage() {
  return (
    <RequireAuth>
      <PageShell title="Account">
        <div className="grid gap-6 md:grid-cols-2">
          <ProfileForm />
          <ChangePasswordForm />
        </div>
      </PageShell>
    </RequireAuth>
  );
}

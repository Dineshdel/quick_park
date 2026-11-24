'use client';

import type { SelfServiceRole } from '@qp/types';
import { useRouter } from 'next/navigation';
import { useEffect, useState } from 'react';
import { AuthCard } from '@/shared/auth/auth-card';
import { RequireAuth } from '@/shared/auth/require-auth';
import { RolePicker } from '@/shared/auth/role-picker';
import { Button } from '@/shared/ui/button';
import { api, ApiError, session, type AuthResult } from '@/shared/lib/api';
import { homeFor } from '@/shared/lib/auth/role-home';
import { useSession } from '@/shared/lib/auth/use-session';
import { ErrorPopup } from '@/shared/ui/confirm-dialog';

function ChooseRole() {
  const router = useRouter();
  const s = useSession();
  const [role, setRole] = useState<SelfServiceRole>();
  const [error, setError] = useState<string | null>(null);
  const [saving, setSaving] = useState(false);

  // Users who already have a role don't belong here.
  const existingRole = s.status === 'authenticated' ? s.user.role : null;
  useEffect(() => {
    if (existingRole) router.replace(homeFor(existingRole));
  }, [existingRole, router]);

  return (
    <div className="grid gap-4">
      <RolePicker value={role} onChange={setRole} />
      <p className="text-sm text-muted-foreground">
        This can't be changed later. Use a different email for the other account type.
      </p>
      <ErrorPopup message={error} onClose={() => setError(null)} />
      <Button
        disabled={!role}
        loading={saving}
        onClick={async () => {
          setSaving(true);
          setError(null);
          try {
            const r = await api<AuthResult>('/auth/choose-role', { body: { role } });
            session.apply(r);
            router.replace(homeFor(r.user.role));
          } catch (e) {
            setError(e instanceof ApiError ? e.message : 'Could not save');
            setSaving(false);
          }
        }}
      >
        Continue
      </Button>
    </div>
  );
}

export default function ChooseRolePage() {
  return (
    <AuthCard title="Choose your account type" description="How will you use Quick Park?">
      <RequireAuth>
        <ChooseRole />
      </RequireAuth>
    </AuthCard>
  );
}

import type { ReactNode } from 'react';
import { RequireAuth } from '@/shared/auth/require-auth';
import { RoleShell } from '../../_components/role-shell';

export default function AdminLayout({ children }: { children: ReactNode }) {
  return (
    <RequireAuth roles={['SUPER_ADMIN']}>
      <RoleShell>{children}</RoleShell>
    </RequireAuth>
  );
}

import type { ReactNode } from 'react';
import { RequireAuth } from '@/shared/auth/require-auth';
import { RoleShell } from '../_components/role-shell';

export default function ParkingOwnerLayout({ children }: { children: ReactNode }) {
  return (
    <RequireAuth roles={['PARKING_OWNER']}>
      <RoleShell>{children}</RoleShell>
    </RequireAuth>
  );
}

import type { ReactNode } from 'react';
import { RequireAuth } from '@/shared/auth/require-auth';
import { RoleShell } from '../_components/role-shell';

export default function VehicleOwnerLayout({ children }: { children: ReactNode }) {
  return (
    <RequireAuth roles={['VEHICLE_OWNER']}>
      <RoleShell>{children}</RoleShell>
    </RequireAuth>
  );
}

import type { ReactNode } from 'react';
import { RequireAuth } from '@/shared/auth/require-auth';

export default function VehicleOwnerLayout({ children }: { children: ReactNode }) {
  return <RequireAuth roles={['VEHICLE_OWNER']}>{children}</RequireAuth>;
}

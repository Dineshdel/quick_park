import type { ReactNode } from 'react';
import { RequireAuth } from '@/shared/auth/require-auth';

export default function ParkingOwnerLayout({ children }: { children: ReactNode }) {
  return <RequireAuth roles={['PARKING_OWNER']}>{children}</RequireAuth>;
}

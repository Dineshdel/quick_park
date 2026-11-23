import type { ReactNode } from 'react';
import { RequireAuth } from '@/shared/auth/require-auth';
import { OwnerSidebar } from './_components/owner-sidebar';

export default function ParkingOwnerLayout({ children }: { children: ReactNode }) {
  return (
    <RequireAuth roles={['PARKING_OWNER']}>
      <div className="flex min-h-[calc(100vh-3.5rem)] flex-col lg:flex-row">
        <OwnerSidebar />
        <div className="min-w-0 flex-1">{children}</div>
      </div>
    </RequireAuth>
  );
}

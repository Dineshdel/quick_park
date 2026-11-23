import type { ReactNode } from 'react';
import { RequireAuth } from '@/shared/auth/require-auth';
import { DriverSidebar } from './_components/driver-sidebar';

export default function VehicleOwnerLayout({ children }: { children: ReactNode }) {
  return (
    <RequireAuth roles={['VEHICLE_OWNER']}>
      <div className="flex min-h-[calc(100vh-3.5rem)] flex-col lg:flex-row">
        <DriverSidebar />
        <div className="min-w-0 flex-1">{children}</div>
      </div>
    </RequireAuth>
  );
}

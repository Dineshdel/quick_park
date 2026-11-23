import type { ReactNode } from 'react';
import { RequireAuth } from '@/shared/auth/require-auth';
import { AdminSidebar } from './_components/admin-nav';

export default function AdminLayout({ children }: { children: ReactNode }) {
  return (
    <RequireAuth roles={['SUPER_ADMIN']}>
      <div className="flex min-h-[calc(100vh-3.5rem)] flex-col lg:flex-row">
        <AdminSidebar />
        <div className="min-w-0 flex-1">{children}</div>
      </div>
    </RequireAuth>
  );
}

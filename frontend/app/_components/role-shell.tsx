'use client';

import { ArrowLeft } from 'lucide-react';
import { usePathname, useRouter } from 'next/navigation';
import type { ReactNode } from 'react';
import { homeFor } from '@/shared/lib/auth/role-home';
import { useSession } from '@/shared/lib/auth/use-session';
import { Button } from '@/shared/ui/button';
import { AdminSidebar } from '../admin/(dashboard)/_components/admin-nav';
import { OwnerSidebar } from '../parking-owner/_components/owner-sidebar';
import { DriverSidebar } from '../vehicle-owner/_components/driver-sidebar';

/** "← Back" to the previous page (or the role's home when there is no history, e.g. a fresh tab). */
function BackBar({ home }: { home: string }) {
  const router = useRouter();
  const pathname = usePathname();
  if (pathname === home) return null;
  return (
    <div className="mx-auto max-w-6xl px-4 pt-4 print:hidden">
      <Button
        variant="ghost"
        size="sm"
        className="-ml-2 text-muted-foreground hover:text-foreground"
        onClick={() => (window.history.length > 1 ? router.back() : router.push(home))}
      >
        <ArrowLeft /> Back
      </Button>
    </div>
  );
}

/**
 * Signed-in workspace frame for every role: the role's side menu + a back arrow above the page.
 * Pages shared with the public (search, parking details, account) show the plain page when signed out.
 */
export function RoleShell({ children }: { children: ReactNode }) {
  const s = useSession();
  const role = s.status === 'authenticated' ? s.user.role : null;
  const sidebar =
    role === 'VEHICLE_OWNER' ? (
      <DriverSidebar />
    ) : role === 'PARKING_OWNER' ? (
      <OwnerSidebar />
    ) : role === 'SUPER_ADMIN' ? (
      <AdminSidebar />
    ) : null;
  if (!sidebar) return <>{children}</>;
  return (
    <div className="flex min-h-[calc(100vh-3.5rem)] flex-col lg:flex-row">
      {sidebar}
      <div className="min-w-0 flex-1">
        <BackBar home={homeFor(role)} />
        {children}
      </div>
    </div>
  );
}

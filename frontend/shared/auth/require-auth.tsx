'use client';

import type { Role } from '@qp/types';
import { Loader2 } from 'lucide-react';
import { usePathname, useRouter } from 'next/navigation';
import { useEffect, type ReactNode } from 'react';
import { homeFor } from '@/shared/lib/auth/role-home';
import { useSession } from '@/shared/lib/auth/use-session';

/**
 * Client-side gate for role areas. This is UX only: the API enforces every role and ownership rule.
 */
export function RequireAuth({ roles, children }: { roles?: Role[]; children: ReactNode }) {
  const s = useSession();
  const router = useRouter();
  const pathname = usePathname();

  const redirect =
    s.status === 'anonymous'
      ? `/login?next=${encodeURIComponent(pathname)}`
      : s.status === 'authenticated' && s.user.role === null && roles
        ? '/choose-role'
        : s.status === 'authenticated' && roles && s.user.role && !roles.includes(s.user.role)
          ? homeFor(s.user.role)
          : null;

  useEffect(() => {
    if (redirect) router.replace(redirect);
  }, [redirect, router]);

  if (s.status !== 'authenticated' || redirect) {
    return (
      <div className="flex min-h-[50vh] items-center justify-center">
        <Loader2 className="size-6 animate-spin text-muted-foreground" aria-label="Loading" />
      </div>
    );
  }
  return <>{children}</>;
}

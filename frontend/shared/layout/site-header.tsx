'use client';

import { Car } from 'lucide-react';
import Link from 'next/link';
import { useRouter } from 'next/navigation';
import { Button } from '@/shared/ui/button';
import { logout } from '@/shared/lib/api';
import { homeFor } from '@/shared/lib/auth/role-home';
import { useSession } from '@/shared/lib/auth/use-session';

export function SiteHeader() {
  const s = useSession();
  const router = useRouter();
  return (
    <header className="border-b">
      <div className="mx-auto flex h-14 max-w-6xl items-center justify-between gap-4 px-4">
        <Link href="/" className="flex items-center gap-2 font-semibold">
          <Car className="size-5" aria-hidden /> Quick Park
        </Link>
        <nav className="flex items-center gap-2">
          {s.status === 'authenticated' ? (
            <>
              <Button variant="ghost" size="sm" asChild>
                <Link href={homeFor(s.user.role)}>Dashboard</Link>
              </Button>
              <Button variant="ghost" size="sm" asChild>
                <Link href="/account">{s.user.name.split(' ')[0]}</Link>
              </Button>
              <Button
                variant="outline"
                size="sm"
                onClick={async () => {
                  await logout();
                  router.push('/');
                }}
              >
                Sign out
              </Button>
            </>
          ) : s.status === 'anonymous' ? (
            <>
              <Button variant="ghost" size="sm" asChild>
                <Link href="/login">Sign in</Link>
              </Button>
              <Button size="sm" asChild>
                <Link href="/register">Create account</Link>
              </Button>
            </>
          ) : null}
        </nav>
      </div>
    </header>
  );
}

'use client';

import { Car, UserPlus } from 'lucide-react';
import Link from 'next/link';
import { useRouter } from 'next/navigation';
import { Button } from '@/shared/ui/button';
import { logout } from '@/shared/lib/api';
import { homeFor } from '@/shared/lib/auth/role-home';
import { useSession } from '@/shared/lib/auth/use-session';
import { useT } from '@/shared/i18n/i18n';
import { NotificationBell } from './notification-bell';
import { LanguageSelect, ThemeToggle } from './preferences';

const ON_CHROME = 'text-chrome-foreground hover:bg-chrome-hover hover:text-chrome-strong';

export function SiteHeader() {
  const s = useSession();
  const router = useRouter();
  const t = useT();
  return (
    <header className="bg-midnight sticky top-0 z-[1000] text-chrome-foreground shadow-[0_8px_24px_-12px_oklch(0.4_0.15_248/0.25)] print:hidden">
      <div className="mx-auto flex h-14 max-w-6xl items-center justify-between gap-2 px-4">
        <Link href="/" className="flex items-center gap-2.5">
          <span className="bg-gold-gradient flex size-8 items-center justify-center rounded-lg text-gold-foreground shadow-md shadow-black/30">
            <Car className="size-[18px]" aria-hidden />
          </span>
          <span className="font-serif text-lg font-semibold tracking-tight whitespace-nowrap text-chrome-strong">
            Quick <span className="text-gold-gradient">Park</span>
          </span>
        </Link>
        <nav className="flex items-center gap-1 sm:gap-2">
          <LanguageSelect />
          <ThemeToggle />
          {s.status === 'authenticated' ? (
            <>
              {s.user.role === 'VEHICLE_OWNER' && <NotificationBell className={ON_CHROME} />}
              <Button
                variant="ghost"
                size="sm"
                className={`${ON_CHROME} hidden sm:inline-flex`}
                asChild
              >
                <Link href={homeFor(s.user.role)}>{t('nav.dashboard')}</Link>
              </Button>
              <Button
                variant="ghost"
                size="sm"
                className={`${ON_CHROME} hidden sm:inline-flex`}
                asChild
              >
                <Link href="/account">{s.user.name.split(' ')[0]}</Link>
              </Button>
              <Button
                variant="ghost"
                size="sm"
                className="border border-chrome-muted/40 text-chrome-foreground hover:bg-chrome-hover hover:text-chrome-strong"
                onClick={async () => {
                  await logout();
                  router.push('/');
                }}
              >
                {t('nav.signOut')}
              </Button>
            </>
          ) : s.status === 'anonymous' ? (
            <>
              <Button
                variant="ghost"
                size="sm"
                className={`${ON_CHROME} hidden sm:inline-flex`}
                asChild
              >
                <Link href="/login">{t('nav.signIn')}</Link>
              </Button>
              <Button size="sm" variant="gold" asChild>
                <Link href="/register" aria-label={t('nav.createAccount')}>
                  <UserPlus className="sm:hidden" aria-hidden />
                  <span className="hidden sm:inline">{t('nav.createAccount')}</span>
                </Link>
              </Button>
            </>
          ) : null}
        </nav>
      </div>
      <div className="hairline-gold h-px opacity-60" aria-hidden />
    </header>
  );
}

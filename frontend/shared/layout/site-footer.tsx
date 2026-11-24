'use client';

import { Car } from 'lucide-react';
import Link from 'next/link';
import { usePathname } from 'next/navigation';
import { useT } from '@/shared/i18n/i18n';
import type { MessageKey } from '@/shared/i18n/messages';

const COLUMNS: { title: MessageKey; links: { href: string; label: MessageKey }[] }[] = [
  {
    title: 'footer.drivers',
    links: [
      { href: '/search', label: 'footer.findParking' },
      { href: '/vehicle-owner/bookings', label: 'footer.myBookings' },
      { href: '/vehicle-owner/vehicles', label: 'footer.myVehicles' },
    ],
  },
  {
    title: 'footer.owners',
    links: [
      { href: '/register?role=PARKING_OWNER', label: 'footer.listParking' },
      { href: '/parking-owner', label: 'footer.ownerDashboard' },
      { href: '/parking-owner/scanner', label: 'footer.gateScanner' },
    ],
  },
  {
    title: 'footer.account',
    links: [
      { href: '/login', label: 'nav.signIn' },
      { href: '/register', label: 'nav.createAccount' },
      { href: '/account', label: 'footer.profile' },
    ],
  },
];

export function SiteFooter() {
  // Signed-in workspaces (with a sidebar) are full height; no marketing footer there.
  const path = usePathname();
  const t = useT();
  if (['/admin', '/parking-owner', '/vehicle-owner'].some((p) => path.startsWith(p))) return null;
  return (
    <footer className="bg-midnight mt-16 text-chrome-foreground print:hidden">
      <div className="hairline-gold h-px opacity-50" aria-hidden />
      <div className="mx-auto grid max-w-6xl gap-10 px-4 py-12 sm:grid-cols-2 lg:grid-cols-[1.4fr_1fr_1fr_1fr]">
        <div className="grid content-start gap-3">
          <Link href="/" className="flex items-center gap-2.5">
            <span className="bg-gold-gradient flex size-8 items-center justify-center rounded-lg text-gold-foreground">
              <Car className="size-[18px]" aria-hidden />
            </span>
            <span className="font-serif text-lg font-semibold text-white">
              Quick <span className="text-gold-gradient">Park</span>
            </span>
          </Link>
          <p className="max-w-xs text-sm text-chrome-muted">{t('footer.tagline')}</p>
        </div>
        {COLUMNS.map((c) => (
          <div key={c.title} className="grid content-start gap-3">
            <p className="text-[11px] font-semibold tracking-[0.14em] text-gold-light uppercase">
              {t(c.title)}
            </p>
            <ul className="grid gap-2 text-sm">
              {c.links.map((l) => (
                <li key={l.href}>
                  <Link
                    href={l.href}
                    className="text-chrome-foreground/80 transition-colors hover:text-white"
                  >
                    {t(l.label)}
                  </Link>
                </li>
              ))}
            </ul>
          </div>
        ))}
      </div>
      <div className="border-t border-white/10">
        <p className="mx-auto max-w-6xl px-4 py-5 text-xs text-chrome-muted">
          {t('footer.copyright', { year: new Date().getFullYear() })}
        </p>
      </div>
    </footer>
  );
}

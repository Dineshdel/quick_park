'use client';

import { Car } from 'lucide-react';
import Link from 'next/link';
import { usePathname } from 'next/navigation';
import { useT } from '@/shared/i18n/i18n';
import type { MessageKey } from '@/shared/i18n/messages';

/** Links in the slim footer bar (sign in / create account are already in the header). */
const LINKS: { href: string; label: MessageKey }[] = [
  { href: '/search', label: 'footer.findParking' },
  { href: '/vehicle-owner/bookings', label: 'footer.myBookings' },
  { href: '/vehicle-owner/vehicles', label: 'footer.myVehicles' },
  { href: '/register?role=PARKING_OWNER', label: 'footer.listParking' },
  { href: '/parking-owner', label: 'footer.ownerDashboard' },
  { href: '/parking-owner/scanner', label: 'footer.gateScanner' },
  { href: '/account', label: 'footer.profile' },
];

export function SiteFooter() {
  // Signed-in workspaces (with a sidebar) are full height; no marketing footer there.
  const path = usePathname();
  const t = useT();
  if (['/admin', '/parking-owner', '/vehicle-owner'].some((p) => path.startsWith(p))) return null;
  return (
    // Slim bar that stays pinned to the bottom of the window while the page scrolls.
    <footer className="bg-midnight sticky bottom-0 z-[999] mt-16 border-t border-chrome-line text-chrome-foreground shadow-[0_-6px_18px_-12px_oklch(0.3_0.1_248/0.35)] print:hidden">
      <div className="mx-auto flex h-12 max-w-6xl items-center gap-6 px-4">
        <Link href="/" className="flex shrink-0 items-center gap-2">
          <span className="bg-gold-gradient flex size-6 items-center justify-center rounded-md text-gold-foreground">
            <Car className="size-3.5" aria-hidden />
          </span>
          <span className="font-serif text-sm font-semibold text-chrome-strong">
            Quick <span className="text-gold-gradient">Park</span>
          </span>
        </Link>
        <nav aria-label="Footer" className="hidden flex-1 items-center gap-5 text-xs lg:flex">
          {LINKS.map((l) => (
            <Link
              key={l.href}
              href={l.href}
              className="whitespace-nowrap text-chrome-foreground/85 transition-colors hover:text-chrome-strong"
            >
              {t(l.label)}
            </Link>
          ))}
        </nav>
        <p className="ml-auto shrink-0 text-xs text-chrome-muted">
          © {new Date().getFullYear()} Quick Park
        </p>
      </div>
    </footer>
  );
}

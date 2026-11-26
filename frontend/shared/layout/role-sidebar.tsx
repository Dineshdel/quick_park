'use client';

import { type LucideIcon, Menu, PanelLeftClose, PanelLeftOpen, X } from 'lucide-react';
import Link from 'next/link';
import { usePathname } from 'next/navigation';
import { type ReactNode, useEffect, useState } from 'react';
import { useSession } from '@/shared/lib/auth/use-session';
import { cn } from '@/shared/lib/utils';
import { useT } from '@/shared/i18n/i18n';

export interface SidebarItem {
  href: string;
  label: string;
  icon: LucideIcon;
  /** Small gold counter (e.g. items waiting); hidden when 0 or undefined. */
  count?: number;
}
const COLLAPSED_KEY = 'qp.sidebar.collapsed';

export interface SidebarGroup {
  title?: string;
  items: SidebarItem[];
}

/**
 * The workspace sidebar shared by admin, parking owner and vehicle owner areas.
 * Desktop: sticky sidebar. Phone/tablet: a Menu button that opens the same links in a drawer.
 */
export function RoleSidebar({
  label,
  title,
  subtitle,
  icon: Icon,
  roleName,
  groups,
  homeHref,
}: {
  label: string;
  title: string;
  subtitle: string;
  icon: LucideIcon;
  roleName: string;
  groups: SidebarGroup[];
  homeHref: string;
}) {
  const t = useT();
  const [open, setOpen] = useState(false);
  // Desktop: the menu can be hidden down to an icon strip; remembered per browser.
  const [collapsed, setCollapsed] = useState(false);
  useEffect(() => {
    try {
      setCollapsed(localStorage.getItem(COLLAPSED_KEY) === '1');
    } catch {
      /* storage unavailable: start expanded */
    }
  }, []);
  const toggleCollapsed = () =>
    setCollapsed((c) => {
      try {
        localStorage.setItem(COLLAPSED_KEY, c ? '0' : '1');
      } catch {
        /* ignore */
      }
      return !c;
    });
  const pathname = usePathname();
  useEffect(() => setOpen(false), [pathname]);
  useEffect(() => {
    if (!open) return;
    const onKey = (e: KeyboardEvent) => e.key === 'Escape' && setOpen(false);
    document.addEventListener('keydown', onKey);
    return () => document.removeEventListener('keydown', onKey);
  }, [open]);

  const brand = (
    <div className="flex items-center gap-2.5 px-3">
      <span className="bg-gold-gradient flex size-9 items-center justify-center rounded-lg text-gold-foreground shadow-md shadow-black/20">
        <Icon className="size-[18px]" aria-hidden />
      </span>
      <span className="leading-tight">
        <span className="block font-serif text-base font-semibold text-chrome-strong">{title}</span>
        <span className="block text-xs text-chrome-muted">{subtitle}</span>
      </span>
    </div>
  );

  return (
    <>
      <aside
        className={cn(
          'bg-chrome-panel relative hidden shrink-0 text-chrome-foreground transition-[width] duration-200 lg:block print:hidden',
          collapsed ? 'w-16' : 'w-64',
        )}
      >
        <div
          className="absolute inset-y-0 right-0 w-px bg-gradient-to-b from-gold/40 via-white/10 to-transparent"
          aria-hidden
        />
        <div
          className={cn(
            'sticky top-14 flex h-[calc(100vh-3.5rem)] flex-col overflow-x-hidden overflow-y-auto py-6',
            collapsed ? 'items-center gap-4 px-2' : 'gap-6 px-3',
          )}
        >
          <div
            className={cn('flex items-center', collapsed ? 'flex-col gap-3' : 'justify-between')}
          >
            {collapsed ? (
              <span className="bg-gold-gradient flex size-9 items-center justify-center rounded-lg text-gold-foreground shadow-md shadow-black/20">
                <Icon className="size-[18px]" aria-hidden />
              </span>
            ) : (
              brand
            )}
            <button
              type="button"
              onClick={toggleCollapsed}
              className="rounded-md p-2 text-chrome-muted hover:bg-chrome-hover hover:text-chrome-strong"
              aria-label={collapsed ? 'Show side menu' : 'Hide side menu'}
              title={collapsed ? 'Show side menu' : 'Hide side menu'}
            >
              {collapsed ? (
                <PanelLeftOpen className="size-4" />
              ) : (
                <PanelLeftClose className="size-4" />
              )}
            </button>
          </div>
          <NavLinks label={label} groups={groups} homeHref={homeHref} compact={collapsed} />
          <SignedInAs roleName={roleName} compact={collapsed} />
        </div>
      </aside>

      <div className="bg-chrome-panel sticky top-14 z-[999] flex items-center gap-3 px-4 py-2 text-chrome-foreground lg:hidden print:hidden">
        <button
          type="button"
          onClick={() => setOpen(true)}
          className="inline-flex items-center gap-2 rounded-md border border-chrome-line px-3 py-1.5 text-sm font-medium hover:bg-chrome-hover"
          aria-expanded={open}
          aria-controls="role-drawer"
        >
          <Menu className="size-4" aria-hidden /> {t('ui.menu')}
        </button>
        <span className="text-sm text-chrome-muted">{title}</span>
      </div>
      {open && (
        <div
          className="fixed inset-0 z-[1100] lg:hidden"
          role="dialog"
          aria-modal="true"
          aria-label={`${title} menu`}
          id="role-drawer"
        >
          <button
            type="button"
            className="absolute inset-0 bg-black/40"
            aria-label={t('ui.closeMenu')}
            onClick={() => setOpen(false)}
          />
          <div className="bg-chrome-panel absolute inset-y-0 left-0 flex w-72 max-w-[85vw] flex-col gap-6 overflow-y-auto px-3 py-4 text-chrome-foreground shadow-2xl">
            <div className="flex items-center justify-between">
              {brand}
              <button
                type="button"
                onClick={() => setOpen(false)}
                className="rounded-md p-2 hover:bg-chrome-hover"
                aria-label={t('ui.closeMenu')}
              >
                <X className="size-4" />
              </button>
            </div>
            <NavLinks
              label={label}
              groups={groups}
              homeHref={homeHref}
              onNavigate={() => setOpen(false)}
            />
            <SignedInAs roleName={roleName} />
          </div>
        </div>
      )}
    </>
  );
}

function NavLinks({
  label,
  groups,
  homeHref,
  onNavigate,
  compact = false,
}: {
  label: string;
  groups: SidebarGroup[];
  homeHref: string;
  onNavigate?: () => void;
  /** Icon-only (the hidden desktop menu). */
  compact?: boolean;
}) {
  const pathname = usePathname();
  return (
    <nav aria-label={label} className={cn('grid', compact ? 'gap-3' : 'gap-5')}>
      {groups.map((g, gi) => (
        <div key={g.title ?? gi} className="grid gap-0.5">
          {g.title && !compact && (
            <p className="px-3 pb-1 text-xs font-semibold text-chrome-muted">{g.title}</p>
          )}
          {g.items.map((item) => {
            const active =
              item.href === homeHref
                ? pathname === homeHref
                : pathname === item.href || pathname.startsWith(`${item.href}/`);
            return (
              <Link
                key={item.href}
                href={item.href}
                onClick={onNavigate}
                aria-current={active ? 'page' : undefined}
                aria-label={compact ? item.label : undefined}
                title={compact ? item.label : undefined}
                className={cn(
                  'relative flex items-center gap-3 rounded-lg px-3 py-2 text-sm font-medium transition-colors',
                  compact && 'justify-center px-0 size-10',
                  active
                    ? 'bg-gradient-to-r from-gold/15 to-transparent text-chrome-strong ring-1 ring-gold/25 before:absolute before:inset-y-2 before:left-0 before:w-[3px] before:rounded-full before:bg-gold'
                    : 'text-chrome-foreground/80 hover:bg-chrome-hover hover:text-chrome-strong',
                )}
              >
                <item.icon
                  className={cn('size-4 shrink-0', active && 'text-gold-light')}
                  aria-hidden
                />
                {!compact && <span className="flex-1 truncate">{item.label}</span>}
                {!!item.count && compact && (
                  <span
                    className="absolute top-1 right-1 size-2 rounded-full bg-gold"
                    aria-label={`${item.count} waiting`}
                  />
                )}
                {!!item.count && !compact && (
                  <span
                    className="bg-gold-gradient min-w-5 rounded-full px-1.5 text-center text-xs font-bold text-gold-foreground tabular-nums shadow-sm"
                    aria-label={`${item.count} waiting`}
                  >
                    {item.count}
                  </span>
                )}
              </Link>
            );
          })}
        </div>
      ))}
    </nav>
  );
}

/** Who is signed in, pinned to the bottom of the sidebar. */
function SignedInAs({
  roleName,
  compact = false,
}: {
  roleName: string;
  compact?: boolean;
}): ReactNode {
  const s = useSession();
  if (s.status !== 'authenticated') return null;
  const initials = s.user.name
    .split(' ')
    .map((w) => w[0])
    .slice(0, 2)
    .join('')
    .toUpperCase();
  return (
    <Link
      href="/account"
      title={compact ? `${s.user.name} · ${roleName}` : undefined}
      className={cn(
        'mt-auto flex items-center gap-3 rounded-xl border border-chrome-line bg-card/60 transition-colors hover:bg-chrome-hover',
        compact ? 'p-1' : 'p-3',
      )}
    >
      <span className="bg-gold-gradient flex size-9 shrink-0 items-center justify-center rounded-full text-sm font-bold text-gold-foreground">
        {initials}
      </span>
      {!compact && (
        <span className="min-w-0 leading-tight">
          <span className="block truncate text-sm font-medium text-chrome-strong">
            {s.user.name}
          </span>
          <span className="block truncate text-xs text-chrome-muted">{roleName}</span>
        </span>
      )}
    </Link>
  );
}

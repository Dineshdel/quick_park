'use client';

import { cn } from '@/shared/lib/utils';

/** Simple segmented tabs (state lives in the parent). */
export function Tabs<T extends string>({
  value,
  onChange,
  items,
  className,
}: {
  value: T;
  onChange: (v: T) => void;
  items: { value: T; label: string }[];
  className?: string;
}) {
  return (
    <div
      role="tablist"
      className={cn('inline-flex flex-wrap gap-1 rounded-lg bg-muted p-1', className)}
    >
      {items.map((i) => (
        <button
          key={i.value}
          role="tab"
          type="button"
          aria-selected={value === i.value}
          onClick={() => onChange(i.value)}
          className={cn(
            'rounded-md px-3 py-1.5 text-sm font-medium transition-colors',
            value === i.value
              ? 'bg-background text-foreground shadow-sm'
              : 'text-muted-foreground hover:text-foreground',
          )}
        >
          {i.label}
        </button>
      ))}
    </div>
  );
}

/**
 * Keeps a page's tabs (and any filters beside them) pinned under the site header while scrolling.
 * Offsets: header 3.5rem, plus the phone/tablet "Menu" bar (≈3.25rem) below the lg breakpoint.
 */
export function StickyBar({
  children,
  className,
}: {
  children: React.ReactNode;
  className?: string;
}) {
  return (
    <div
      className={cn(
        'sticky top-[6.75rem] z-40 -mx-4 border-b border-transparent bg-background/90 px-4 py-2 backdrop-blur-md lg:top-14 print:static',
        '[&_[role=tablist]]:max-w-full [&_[role=tablist]]:flex-nowrap [&_[role=tablist]]:overflow-x-auto [&_[role=tab]]:shrink-0 [&_[role=tab]]:whitespace-nowrap',
        className,
      )}
    >
      {children}
    </div>
  );
}

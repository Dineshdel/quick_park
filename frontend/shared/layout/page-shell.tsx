import type { ReactNode } from 'react';
import { DeckFloor, Orbs, Sparks } from '@/shared/ui/atmosphere';

/**
 * Page frame for every workspace page: a midnight header band with drifting light and a receding deck grid,
 * then the page content, which rises in as it appears.
 */
export function PageShell({
  title,
  description,
  actions,
  children,
}: {
  title: string;
  description?: string;
  /** Optional buttons shown on the right of the header band. */
  actions?: ReactNode;
  children?: ReactNode;
}) {
  return (
    <div className="mx-auto grid max-w-6xl gap-6 px-4 py-6 sm:py-8">
      <header className="bg-aurora relative overflow-hidden rounded-2xl px-6 py-7 text-chrome-foreground shadow-premium-lg sm:px-8">
        {/* Floor grid tipped back in perspective, drifting light and a few rising sparks. */}
        <DeckFloor tilt={62} />
        <Orbs />
        <Sparks count={6} />
        <div className="hairline-gold absolute inset-x-0 bottom-0 h-px opacity-70" aria-hidden />
        <div className="relative flex flex-wrap items-end justify-between gap-4">
          <div className="rise-in">
            <h1 className="text-3xl font-bold tracking-tight text-chrome-strong sm:text-[2.1rem]">
              {title}
            </h1>
            {description && <p className="mt-1.5 max-w-[60ch] text-chrome-muted">{description}</p>}
          </div>
          {actions && <div className="rise-in flex gap-2 [--i:2]">{actions}</div>}
        </div>
      </header>
      <div className="rise-in grid gap-6 [--i:1]">{children}</div>
    </div>
  );
}

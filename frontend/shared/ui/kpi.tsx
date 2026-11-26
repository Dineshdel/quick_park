'use client';

import type { ReactNode } from 'react';
import { cn } from '@/shared/lib/utils';
import { Card, CardContent } from '@/shared/ui/card';
import { CountUp } from '@/shared/ui/count-up';
import { Tilt } from '@/shared/ui/tilt';

/**
 * Stat tile: label, big number, optional hint and icon, on a 3D plane that leans toward the pointer.
 * A numeric `value` counts up; pass `format` to render it (e.g. rupees). `tone="alert"` draws attention.
 * `progress` (0–1) draws a lit bar along the bottom edge.
 */
export function Kpi({
  label,
  value,
  format,
  hint,
  icon,
  tone,
  progress,
}: {
  label: string;
  value: ReactNode;
  format?: (n: number) => string;
  hint?: string;
  icon?: ReactNode;
  tone?: 'alert';
  progress?: number;
}) {
  return (
    <Tilt className="h-full">
      <Card
        className={cn(
          'group relative h-full overflow-hidden hover:shadow-premium-lg',
          tone === 'alert' && 'ring-1 ring-gold/60',
        )}
      >
        <span
          className={cn(
            'bg-gold-gradient absolute inset-x-0 top-0 h-0.5 transition-opacity',
            tone === 'alert' ? 'opacity-100' : 'opacity-0 group-hover:opacity-100',
          )}
          aria-hidden
        />
        {/* Soft colour wash in the corner the icon sits in. */}
        <span
          aria-hidden
          className={cn(
            'pointer-events-none absolute -top-16 -right-16 size-40 rounded-full blur-2xl transition-opacity',
            tone === 'alert' ? 'bg-gold/25' : 'bg-primary/10 group-hover:bg-gold/15',
          )}
        />
        <CardContent className="relative flex items-start justify-between gap-3 py-5">
          <div className="min-w-0">
            <p className="text-sm font-medium text-muted-foreground">{label}</p>
            <p className="mt-2 font-serif text-[2rem] leading-none font-semibold tracking-tight tabular-nums">
              {typeof value === 'number' ? <CountUp value={value} format={format} /> : value}
            </p>
            {hint && <p className="mt-2 text-xs text-muted-foreground">{hint}</p>}
          </div>
          {icon && (
            <div
              className={cn(
                'flex size-11 shrink-0 items-center justify-center rounded-xl transition-transform duration-300 group-hover:-translate-y-1 group-hover:rotate-[-4deg] [&_svg]:size-5',
                tone === 'alert' ? 'icon-3d-gold text-gold-foreground' : 'icon-3d text-gold-light',
              )}
            >
              {icon}
            </div>
          )}
        </CardContent>
        {progress !== undefined && (
          <div className="absolute inset-x-0 bottom-0 h-1 bg-muted" aria-hidden>
            <div
              className="bg-gold-gradient h-full shadow-[0_0_10px_var(--gold)] transition-[width] duration-1000"
              style={{ width: `${Math.max(0, Math.min(1, progress)) * 100}%` }}
            />
          </div>
        )}
      </Card>
    </Tilt>
  );
}

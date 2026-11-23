import type { ReactNode } from 'react';
import { cn } from '@/shared/lib/utils';
import { Card, CardContent } from '@/shared/ui/card';

/** Stat tile: label, big number, optional hint and icon. `tone="alert"` draws attention (gold edge). */
export function Kpi({ label, value, hint, icon, tone }: { label: string; value: ReactNode; hint?: string; icon?: ReactNode; tone?: 'alert' }) {
  return (
    <Card className={cn('group relative h-full overflow-hidden transition-all hover:-translate-y-0.5 hover:shadow-premium-lg', tone === 'alert' && 'ring-1 ring-gold/50')}>
      <span className={cn('bg-gold-gradient absolute inset-x-0 top-0 h-0.5 transition-opacity', tone === 'alert' ? 'opacity-100' : 'opacity-0 group-hover:opacity-100')} aria-hidden />
      <CardContent className="flex items-start justify-between gap-3 py-5">
        <div className="min-w-0">
          <p className="text-xs font-semibold tracking-[0.08em] text-muted-foreground uppercase">{label}</p>
          <p className="mt-2 font-serif text-[2rem] leading-none font-semibold tabular-nums tracking-tight">{value}</p>
          {hint && <p className="mt-2 text-xs text-muted-foreground">{hint}</p>}
        </div>
        {icon && <div className="bg-midnight flex size-11 shrink-0 items-center justify-center rounded-xl text-gold-light shadow-md shadow-primary/20 [&_svg]:size-5">{icon}</div>}
      </CardContent>
    </Card>
  );
}

import { type ReactNode, useId } from 'react';
import { cn } from '@/shared/lib/utils';

/**
 * Ring gauge (0–1). The arc is drawn with a gold→deep-gold gradient and a soft glow so it reads as lit.
 * Turns red-ish when `warnAt` is passed (e.g. a car park nearly full).
 */
export function Gauge({
  value,
  size = 120,
  stroke = 12,
  label,
  sub,
  warnAt = 0.9,
  className,
}: {
  value: number;
  size?: number;
  stroke?: number;
  label?: ReactNode;
  sub?: ReactNode;
  warnAt?: number;
  className?: string;
}) {
  const v = Math.max(0, Math.min(1, Number.isFinite(value) ? value : 0));
  const r = (size - stroke) / 2;
  const c = 2 * Math.PI * r;
  const id = `gauge${useId().replace(/:/g, '')}`;
  const warn = v >= warnAt;
  return (
    <div
      className={cn('relative inline-grid place-items-center', className)}
      style={{ width: size, height: size }}
    >
      <svg
        width={size}
        height={size}
        viewBox={`0 0 ${size} ${size}`}
        className="-rotate-90"
        aria-hidden
      >
        <defs>
          <linearGradient id={id} x1="0" y1="0" x2="1" y2="1">
            <stop offset="0%" stopColor={warn ? 'oklch(0.75 0.17 35)' : 'oklch(0.9 0.16 254)'} />
            <stop offset="100%" stopColor={warn ? 'oklch(0.58 0.2 27)' : 'oklch(0.62 0.192 254)'} />
          </linearGradient>
        </defs>
        <circle
          cx={size / 2}
          cy={size / 2}
          r={r}
          fill="none"
          strokeWidth={stroke}
          className="stroke-muted"
        />
        <circle
          cx={size / 2}
          cy={size / 2}
          r={r}
          fill="none"
          stroke={`url(#${id})`}
          strokeWidth={stroke}
          strokeLinecap="round"
          strokeDasharray={c}
          strokeDashoffset={c * (1 - v)}
          style={{
            transition: 'stroke-dashoffset 1s cubic-bezier(0.2,0.7,0.2,1)',
            filter: `drop-shadow(0 0 6px ${warn ? 'oklch(0.6 0.2 27 / 0.5)' : 'oklch(0.78 0.192 254 / 0.55)'})`,
          }}
        />
      </svg>
      <div className="absolute inset-0 grid place-content-center text-center leading-tight">
        <span className="font-serif text-xl font-bold tabular-nums">
          {label ?? `${Math.round(v * 100)}%`}
        </span>
        {sub && <span className="text-[11px] text-muted-foreground">{sub}</span>}
      </div>
    </div>
  );
}

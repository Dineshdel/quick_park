import type { CSSProperties } from 'react';
import { cn } from '@/shared/lib/utils';

/**
 * Decorative light for midnight panels (hero, page headers, auth panel). Purely visual: hidden from
 * assistive tech, ignores the pointer, and holds still for visitors who prefer reduced motion (globals.css).
 * Positions are fixed numbers, not random, so server and client render the same markup.
 */

/** Two or three blurred orbs drifting behind the content. */
export function Orbs({ className, dense }: { className?: string; dense?: boolean }) {
  return (
    <div
      className={cn('pointer-events-none absolute inset-0 overflow-hidden', className)}
      aria-hidden
    >
      <span className="qp-orb -top-24 -left-16 size-72 bg-[var(--glow-a)]" />
      <span
        className="qp-orb top-1/3 -right-20 size-64 bg-[var(--glow-b)]"
        style={{ '--d': '-5s' } as CSSProperties}
      />
      {dense && (
        <span
          className="qp-orb -bottom-28 left-1/3 size-80 bg-[var(--glow-c)]"
          style={{ '--d': '-10s' } as CSSProperties}
        />
      )}
    </div>
  );
}

/** Headlight beams sweeping in from the top. */
export function Beams({ className }: { className?: string }) {
  return (
    <div
      className={cn('pointer-events-none absolute inset-0 overflow-hidden', className)}
      aria-hidden
    >
      <span className="qp-beam left-[8%]" />
      <span className="qp-beam left-[52%]" style={{ '--d': '-7s' } as CSSProperties} />
    </div>
  );
}

const SPARKS = [
  { l: 6, d: 0, s: 9 },
  { l: 14, d: -3.2, s: 11 },
  { l: 23, d: -6.1, s: 8 },
  { l: 31, d: -1.4, s: 12 },
  { l: 42, d: -4.8, s: 10 },
  { l: 51, d: -7.5, s: 9 },
  { l: 60, d: -2.3, s: 13 },
  { l: 68, d: -5.6, s: 8.5 },
  { l: 77, d: -0.9, s: 11 },
  { l: 85, d: -8.2, s: 10 },
  { l: 93, d: -3.9, s: 12 },
];

/** Gold sparks rising slowly through the panel. */
export function Sparks({
  className,
  count = SPARKS.length,
}: {
  className?: string;
  count?: number;
}) {
  return (
    <div
      className={cn('pointer-events-none absolute inset-0 overflow-hidden', className)}
      aria-hidden
    >
      {SPARKS.slice(0, count).map((p) => (
        <span
          key={p.l}
          className="qp-spark"
          style={{ left: `${p.l}%`, '--d': `${p.d}s`, '--s': `${p.s}s` } as CSSProperties}
        />
      ))}
    </div>
  );
}

/** Perspective floor grid (car-park deck) fading into the distance. */
export function DeckFloor({ className, tilt = 64 }: { className?: string; tilt?: number }) {
  return (
    <div
      className={cn('pointer-events-none absolute inset-0 [perspective:600px]', className)}
      aria-hidden
    >
      <div
        className="bg-deck-grid absolute -inset-x-1/4 -bottom-1/3 h-[130%] origin-bottom [mask-image:linear-gradient(to_top,black,transparent_70%)]"
        style={{ transform: `rotateX(${tilt}deg)` }}
      />
    </div>
  );
}

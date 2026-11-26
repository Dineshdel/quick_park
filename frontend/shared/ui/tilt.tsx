'use client';

import * as React from 'react';
import { cn } from '@/shared/lib/utils';

/**
 * Wraps content in a 3D plane that leans toward the pointer, with a soft glare where the "light" hits.
 * Mouse/pen only (touch scrolling stays untouched) and disabled for visitors who prefer reduced motion.
 */
export function Tilt({
  max = 8,
  glare = true,
  className,
  children,
  ...props
}: React.ComponentProps<'div'> & { max?: number; glare?: boolean }) {
  const ref = React.useRef<HTMLDivElement>(null);
  const frame = React.useRef(0);

  const reset = () => {
    const el = ref.current;
    if (!el) return;
    el.style.setProperty('--rx', '0deg');
    el.style.setProperty('--ry', '0deg');
    el.style.setProperty('--glare', '0');
  };

  return (
    <div className={cn('[perspective:900px]', className)} {...props}>
      <div
        ref={ref}
        onPointerMove={(e) => {
          if (e.pointerType === 'touch') return;
          if (window.matchMedia('(prefers-reduced-motion: reduce)').matches) return;
          const el = ref.current;
          if (!el) return;
          const r = el.getBoundingClientRect();
          const px = (e.clientX - r.left) / r.width;
          const py = (e.clientY - r.top) / r.height;
          cancelAnimationFrame(frame.current);
          frame.current = requestAnimationFrame(() => {
            el.style.setProperty('--rx', `${(0.5 - py) * max}deg`);
            el.style.setProperty('--ry', `${(px - 0.5) * max}deg`);
            el.style.setProperty('--gx', `${px * 100}%`);
            el.style.setProperty('--gy', `${py * 100}%`);
            el.style.setProperty('--glare', '1');
          });
        }}
        onPointerLeave={reset}
        className="relative h-full transition-transform duration-300 ease-out will-change-transform [transform-style:preserve-3d] [transform:rotateX(var(--rx,0deg))_rotateY(var(--ry,0deg))]"
      >
        {children}
        {glare && (
          <span
            aria-hidden
            className="pointer-events-none absolute inset-0 rounded-[inherit] opacity-[var(--glare,0)] transition-opacity duration-300 [background:radial-gradient(400px_circle_at_var(--gx,50%)_var(--gy,50%),oklch(1_0_0/0.18),transparent_45%)]"
          />
        )}
      </div>
    </div>
  );
}

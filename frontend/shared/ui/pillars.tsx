'use client';

import { CountUp } from '@/shared/ui/count-up';

export interface Pillar {
  label: string;
  value: number;
  /** 'gold' draws the column in gold; default is the midnight blue. */
  tone?: 'gold' | 'navy';
}

const FACES = {
  navy: {
    front: 'linear-gradient(180deg, oklch(0.42 0.165 248), oklch(0.26 0.105 248))',
    side: 'oklch(0.2 0.09 248)',
    top: 'oklch(0.55 0.18 248)',
  },
  gold: {
    front: 'linear-gradient(180deg, oklch(0.88 0.16 254), oklch(0.66 0.192 254))',
    side: 'oklch(0.55 0.176 254)',
    top: 'oklch(0.93 0.128 254)',
  },
};

/**
 * Isometric 3D columns (front, side and top faces). Heights use a square-root scale so a count of 5 is
 * still visible next to 5,000; the true number is printed above each column.
 */
export function Pillars3D({ data, height = 180 }: { data: Pillar[]; height?: number }) {
  const max = Math.max(1, ...data.map((d) => Math.sqrt(Math.max(0, d.value))));
  const depth = 14;
  return (
    <div
      className="flex items-end justify-around gap-3 px-2 pt-8"
      style={{ height: height + 64 }}
      role="list"
    >
      {data.map((d, i) => {
        const f = FACES[d.tone ?? 'navy'];
        const h = Math.max(6, (Math.sqrt(Math.max(0, d.value)) / max) * height);
        return (
          <div
            key={d.label}
            role="listitem"
            className="flex min-w-0 flex-1 flex-col items-center gap-2"
          >
            <span className="font-serif text-lg font-bold">
              <CountUp value={d.value} />
            </span>
            <div className="relative w-full max-w-14" style={{ height: h, marginRight: depth }}>
              <div
                className="absolute inset-0 origin-bottom rounded-t-[3px] transition-[height] duration-1000"
                style={{
                  background: f.front,
                  animation: `qp-grow 0.9s cubic-bezier(0.2,0.7,0.2,1) ${i * 90}ms backwards`,
                  boxShadow: 'inset 0 1px 0 rgb(255 255 255 / 0.25)',
                }}
              />
              {/* side face */}
              <div
                className="absolute top-0 left-full h-full origin-left"
                style={{
                  width: depth,
                  background: f.side,
                  transform: 'skewY(-45deg)',
                  animation: `qp-grow 0.9s cubic-bezier(0.2,0.7,0.2,1) ${i * 90}ms backwards`,
                  transformOrigin: 'bottom left',
                }}
              />
              {/* top face */}
              <div
                className="absolute bottom-full left-0 w-full origin-bottom-left"
                style={{
                  height: depth,
                  background: f.top,
                  transform: 'skewX(-45deg)',
                  animation: `qp-appear 0.4s ease-out ${i * 90 + 600}ms backwards`,
                }}
              />
              {/* floor shadow */}
              <div className="absolute -bottom-2 left-1 h-3 w-[120%] rounded-[50%] bg-black/20 blur-md" />
            </div>
            <span className="max-w-full truncate text-center text-xs text-muted-foreground">
              {d.label}
            </span>
          </div>
        );
      })}
    </div>
  );
}

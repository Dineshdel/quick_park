import type { CSSProperties } from 'react';
import { cn } from '@/shared/lib/utils';

const BAY_W = 34;
const BAY_D = 56;
const AISLE = 30;
const MAX_BAYS = 24;
const TONES = ['#c9d0dc', '#8d97a8', '#e6e9ef', '#5e6a7e', '#aab3c2', '#d9b25a'];

/** Deterministic spread so occupied bays look natural rather than filling left to right. */
function pickTaken(total: number, taken: number): Set<number> {
  const order = Array.from({ length: total }, (_, i) => i).sort(
    (a, b) => ((a * 7919) % 31) - ((b * 7919) % 31) || a - b,
  );
  return new Set(order.slice(0, taken));
}

/** A box standing on the deck: top face lifted by `h`, four walls folded up from the footprint. */
function Cuboid({
  w,
  d,
  h,
  color,
  style,
  className,
}: {
  w: number;
  d: number;
  h: number;
  color: string;
  style?: CSSProperties;
  className?: string;
}) {
  const wall = (extra: CSSProperties, shade: number) => (
    <span
      className="absolute"
      style={{ background: color, filter: `brightness(${shade})`, ...extra }}
    />
  );
  return (
    <span
      className={cn('absolute [transform-style:preserve-3d]', className)}
      style={{ width: w, height: d, ...style }}
    >
      {/* walls */}
      {wall(
        {
          left: 0,
          top: '100%',
          width: w,
          height: h,
          transformOrigin: 'top',
          transform: 'rotateX(90deg)',
        },
        0.62,
      )}
      {wall(
        {
          left: 0,
          bottom: '100%',
          width: w,
          height: h,
          transformOrigin: 'bottom',
          transform: 'rotateX(-90deg)',
        },
        0.75,
      )}
      {wall(
        {
          top: 0,
          right: '100%',
          width: h,
          height: d,
          transformOrigin: 'right',
          transform: 'rotateY(90deg)',
        },
        0.8,
      )}
      {wall(
        {
          top: 0,
          left: '100%',
          width: h,
          height: d,
          transformOrigin: 'left',
          transform: 'rotateY(-90deg)',
        },
        0.7,
      )}
      {/* roof with windscreen */}
      <span
        className="absolute inset-0 rounded-[5px]"
        style={{
          background: color,
          transform: `translateZ(${h}px)`,
          boxShadow: 'inset 0 0 0 1px rgb(255 255 255 / 0.25)',
        }}
      >
        <span className="absolute inset-x-[3px] top-[6px] h-[9px] rounded-[2px] bg-[#1b2540]/75" />
        <span className="absolute inset-x-[3px] bottom-[6px] h-[6px] rounded-[2px] bg-[#1b2540]/55" />
      </span>
    </span>
  );
}

/**
 * Isometric 3D car-park deck: painted bays either side of an aisle, with a car standing in each occupied bay.
 * Large places are drawn to scale (at most 24 bays), so the picture shows how full it is, not exact bays.
 */
export function IsoLot({
  capacity,
  inside,
  className,
}: {
  capacity: number;
  inside: number;
  className?: string;
}) {
  const bays = Math.max(2, Math.min(MAX_BAYS, capacity || 2));
  const ratio = capacity ? Math.min(1, inside / capacity) : 0;
  const takenCount = Math.round(bays * ratio);
  const taken = pickTaken(bays, takenCount);
  const perRow = Math.ceil(bays / 2);
  const width = perRow * BAY_W + 24;
  const depth = BAY_D * 2 + AISLE + 24;

  const bay = (i: number) => {
    const row = i < perRow ? 0 : 1;
    const col = row === 0 ? i : i - perRow;
    const x = 12 + col * BAY_W;
    const y = 12 + (row === 0 ? 0 : BAY_D + AISLE);
    return (
      <span key={i}>
        <span
          className="absolute border-x border-white/35"
          style={{ left: x, top: y, width: BAY_W, height: BAY_D }}
        />
        {taken.has(i) && (
          <span
            className="qp-iso-car absolute"
            style={{ left: x + 5, top: y + 6, '--i': i } as CSSProperties}
          >
            <Cuboid w={BAY_W - 10} d={BAY_D - 12} h={11} color={TONES[(i * 5) % TONES.length]!} />
          </span>
        )}
      </span>
    );
  };

  return (
    <div
      className={cn(
        'qp-iso-stage relative flex items-center justify-center overflow-hidden',
        className,
      )}
      role="img"
      aria-label={`${inside} of ${capacity} slots occupied`}
    >
      <div
        className="qp-iso-deck relative shrink-0 rounded-xl"
        style={{
          width,
          height: depth,
          background: 'linear-gradient(135deg, oklch(0.3 0.075 248), oklch(0.22 0.068 248))',
          boxShadow: '0 0 0 2px oklch(1 0 0 / 0.08), 0 40px 60px -10px oklch(0 0 0 / 0.55)',
        }}
      >
        {/* Deck slab thickness */}
        <span
          className="absolute left-0 top-full w-full rounded-b-xl"
          style={{
            height: 14,
            background: 'oklch(0.17 0.06 248)',
            transformOrigin: 'top',
            transform: 'rotateX(90deg)',
          }}
        />
        <span
          className="absolute top-0 left-full h-full"
          style={{
            width: 14,
            background: 'oklch(0.14 0.053 248)',
            transformOrigin: 'left',
            transform: 'rotateY(-90deg)',
          }}
        />
        {/* Aisle centre line */}
        <span
          className="absolute border-t-2 border-dashed"
          style={{
            left: 12,
            right: 12,
            top: 12 + BAY_D + AISLE / 2 - 1,
            borderColor: 'oklch(0.82 0.192 254 / 0.6)',
          }}
        />
        {Array.from({ length: bays }, (_, i) => bay(i))}
      </div>
    </div>
  );
}

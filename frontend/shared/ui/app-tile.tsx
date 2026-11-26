import Link from 'next/link';
import type { CSSProperties, ReactNode } from 'react';
import { cn } from '@/shared/lib/utils';

/** Hues for app-icon tiles: shades of the blue palette (azure, sky, cyan, teal), cycled so a row of tiles has variety. */
export const TILE_HUES = [252, 222, 198, 240, 180, 262, 210, 168] as const;

/**
 * App-store style tile: a glossy squircle icon in its own colour with a label underneath.
 * `hue` picks the gradient (see TILE_HUES); pass `href` for a link or `onClick` for a button.
 */
export function AppTile({
  icon,
  label,
  hue,
  href,
  onClick,
  badge,
  className,
  style,
}: {
  icon: ReactNode;
  label: string;
  hue: number;
  href?: string;
  onClick?: () => void;
  /** Small count/label on the icon's corner. */
  badge?: ReactNode;
  className?: string;
  style?: CSSProperties;
}) {
  const body = (
    <>
      <span className="qp-app-icon relative" style={{ '--h': hue } as CSSProperties}>
        {icon}
        {badge !== undefined && (
          <span className="absolute -top-1.5 -right-1.5 min-w-5 rounded-full bg-destructive px-1.5 text-center text-[11px] leading-5 font-bold text-white ring-2 ring-background">
            {badge}
          </span>
        )}
      </span>
      <span className="line-clamp-2 text-center text-[0.8rem] leading-tight font-medium">
        {label}
      </span>
    </>
  );
  const cls = cn(
    'group grid w-full justify-items-center gap-2 rounded-2xl p-2 outline-none focus-visible:ring-[3px] focus-visible:ring-ring/50',
    className,
  );
  return href ? (
    <Link href={href} className={cls} style={style}>
      {body}
    </Link>
  ) : (
    <button type="button" onClick={onClick} className={cls} style={style}>
      {body}
    </button>
  );
}

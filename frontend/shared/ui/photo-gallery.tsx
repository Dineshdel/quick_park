'use client';

import { ChevronLeft, ChevronRight, Expand, X } from 'lucide-react';
import { useCallback, useEffect, useRef, useState } from 'react';
import { cn } from '@/shared/lib/utils';

export interface GalleryPhoto {
  id: string;
  url: string;
}

/**
 * Row of photo thumbnails; clicking one opens a full-screen viewer with previous / next, a counter, thumbnails,
 * arrow keys, swipe on phones, and Esc or a click outside to close.
 */
export function PhotoGallery({
  photos,
  alt,
  size = 'lg',
  className,
}: {
  photos: GalleryPhoto[];
  alt: string;
  /** Thumbnail size: lg on the place page, sm in lists. */
  size?: 'sm' | 'lg';
  className?: string;
}) {
  const [index, setIndex] = useState<number | null>(null);
  const dialog = useRef<HTMLDialogElement>(null);
  const touchX = useRef<number | null>(null);
  const n = photos.length;

  const go = useCallback((d: number) => setIndex((i) => (i === null ? i : (i + d + n) % n)), [n]);

  useEffect(() => {
    const d = dialog.current;
    if (!d) return;
    if (index !== null && !d.open) d.showModal();
    if (index === null && d.open) d.close();
  }, [index]);

  useEffect(() => {
    if (index === null) return;
    const onKey = (e: KeyboardEvent) => {
      if (e.key === 'ArrowRight') go(1);
      if (e.key === 'ArrowLeft') go(-1);
    };
    document.addEventListener('keydown', onKey);
    return () => document.removeEventListener('keydown', onKey);
  }, [index, go]);

  if (!n) return null;
  const current = index === null ? null : photos[index];

  return (
    <>
      <div className={cn('flex gap-2 overflow-x-auto pb-1', className)}>
        {photos.map((ph, i) => (
          <button
            key={ph.id}
            type="button"
            onClick={() => setIndex(i)}
            className={cn(
              'group relative shrink-0 overflow-hidden rounded-lg focus-visible:ring-[3px] focus-visible:ring-ring/50 focus-visible:outline-none',
              size === 'lg' ? 'h-48 w-72' : 'h-24 w-32',
            )}
            aria-label={`Open photo ${i + 1} of ${n}`}
          >
            <img
              src={ph.url}
              alt={`${alt} ${i + 1}`}
              className="size-full object-cover transition-transform duration-300 group-hover:scale-105"
            />
            <span className="absolute right-2 bottom-2 inline-flex items-center gap-1 rounded-md bg-black/60 px-2 py-1 text-xs text-white opacity-0 transition-opacity group-hover:opacity-100 group-focus-visible:opacity-100">
              <Expand className="size-3.5" aria-hidden /> View
            </span>
          </button>
        ))}
      </div>

      <dialog
        ref={dialog}
        aria-label={`${alt} photos`}
        onCancel={(e) => {
          e.preventDefault();
          setIndex(null);
        }}
        onClick={(e) => e.target === e.currentTarget && setIndex(null)}
        className="m-0 h-dvh max-h-none w-screen max-w-none bg-transparent p-0 backdrop:bg-black/90"
      >
        {current && (
          <div
            className="relative flex h-full flex-col items-center justify-center gap-3 p-4 sm:p-10"
            onClick={(e) => e.target === e.currentTarget && setIndex(null)}
            onTouchStart={(e) => (touchX.current = e.touches[0]?.clientX ?? null)}
            onTouchEnd={(e) => {
              const start = touchX.current;
              const end = e.changedTouches[0]?.clientX;
              if (start != null && end != null && Math.abs(end - start) > 50)
                go(end < start ? 1 : -1);
              touchX.current = null;
            }}
          >
            <div className="absolute top-3 right-3 left-3 flex items-center justify-between text-sm text-white">
              <span className="rounded-md bg-black/50 px-2.5 py-1 tabular-nums">
                {index! + 1} / {n}
              </span>
              <button
                type="button"
                onClick={() => setIndex(null)}
                className="grid size-10 place-items-center rounded-full bg-black/50 hover:bg-black/70"
                aria-label="Close"
              >
                <X className="size-5" />
              </button>
            </div>

            <img
              src={current.url}
              alt={`${alt} ${index! + 1}`}
              className="max-h-[78dvh] max-w-full rounded-lg object-contain shadow-2xl"
            />

            {n > 1 && (
              <>
                <button
                  type="button"
                  onClick={() => go(-1)}
                  className="absolute top-1/2 left-2 grid size-11 -translate-y-1/2 place-items-center rounded-full bg-black/50 text-white hover:bg-black/70 sm:left-6"
                  aria-label="Previous photo"
                >
                  <ChevronLeft className="size-6" />
                </button>
                <button
                  type="button"
                  onClick={() => go(1)}
                  className="absolute top-1/2 right-2 grid size-11 -translate-y-1/2 place-items-center rounded-full bg-black/50 text-white hover:bg-black/70 sm:right-6"
                  aria-label="Next photo"
                >
                  <ChevronRight className="size-6" />
                </button>
                <div className="flex max-w-full gap-2 overflow-x-auto p-1">
                  {photos.map((ph, i) => (
                    <button
                      key={ph.id}
                      type="button"
                      onClick={() => setIndex(i)}
                      aria-label={`Show photo ${i + 1}`}
                      aria-current={i === index}
                      className={cn(
                        'h-14 w-20 shrink-0 overflow-hidden rounded-md border-2 transition-opacity',
                        i === index
                          ? 'border-white'
                          : 'border-transparent opacity-60 hover:opacity-100',
                      )}
                    >
                      <img src={ph.url} alt="" className="size-full object-cover" />
                    </button>
                  ))}
                </div>
              </>
            )}
          </div>
        )}
      </dialog>
    </>
  );
}

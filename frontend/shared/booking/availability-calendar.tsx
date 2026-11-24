'use client';

import type { CalendarDto } from '@qp/types';
import { useQuery } from '@tanstack/react-query';
import { ChevronLeft, ChevronRight } from 'lucide-react';
import { useState } from 'react';
import { api } from '@/shared/lib/api';
import { cn } from '@/shared/lib/utils';
import { Button } from '@/shared/ui/button';

const STATE_CLASS = {
  free: 'bg-success/15 text-success',
  few: 'bg-amber-500/20 text-amber-700 dark:text-amber-400',
  full: 'bg-destructive/15 text-destructive',
  closed: 'bg-muted text-muted-foreground line-through',
};

const monthKey = (d: Date) => `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}`;

/** Month view of free / few-left / full days for one vehicle type (public endpoint). */
export function AvailabilityCalendar({
  locationId,
  vehicleTypeId,
  onPickDate,
}: {
  locationId: string;
  vehicleTypeId: string;
  onPickDate?: (date: string) => void;
}) {
  const [cursor, setCursor] = useState(() => new Date());
  const month = monthKey(cursor);
  const cal = useQuery({
    queryKey: ['calendar', locationId, vehicleTypeId, month],
    queryFn: () =>
      api<CalendarDto>(
        `/parkings/${locationId}/calendar?month=${month}&vehicleType=${vehicleTypeId}`,
      ),
  });
  const first = new Date(cursor.getFullYear(), cursor.getMonth(), 1);
  const lead = (first.getDay() + 6) % 7; // Monday first
  const today = new Date().toISOString().slice(0, 10);
  const shift = (n: number) => setCursor(new Date(cursor.getFullYear(), cursor.getMonth() + n, 1));

  return (
    <div className="grid gap-3">
      <div className="flex items-center justify-between">
        <Button
          variant="ghost"
          size="icon"
          onClick={() => shift(-1)}
          aria-label="Previous month"
          disabled={month <= monthKey(new Date())}
        >
          <ChevronLeft />
        </Button>
        <p className="font-medium">
          {first.toLocaleDateString('en-IN', { month: 'long', year: 'numeric' })}
        </p>
        <Button variant="ghost" size="icon" onClick={() => shift(1)} aria-label="Next month">
          <ChevronRight />
        </Button>
      </div>
      <div className="grid grid-cols-7 gap-1 text-center text-xs">
        {['Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat', 'Sun'].map((d) => (
          <div key={d} className="py-1 text-muted-foreground">
            {d}
          </div>
        ))}
        {Array.from({ length: lead }, (_, i) => (
          <div key={`lead-${i}`} />
        ))}
        {cal.isPending
          ? Array.from({ length: 30 }, (_, i) => (
              <div key={i} className="h-11 animate-pulse rounded-md bg-muted" />
            ))
          : cal.data?.days.map((d) => {
              const past = d.date < today;
              return (
                <button
                  type="button"
                  key={d.date}
                  disabled={past || d.state === 'full' || d.state === 'closed' || !onPickDate}
                  onClick={() => onPickDate?.(d.date)}
                  title={past ? 'Past' : d.state === 'closed' ? 'Closed' : `${d.free} free`}
                  className={cn(
                    'flex h-11 flex-col items-center justify-center rounded-md text-sm transition-opacity',
                    past ? 'opacity-30' : STATE_CLASS[d.state],
                    onPickDate && !past && 'hover:ring-2 hover:ring-ring/50',
                  )}
                >
                  <span className="font-medium">{Number(d.date.slice(8))}</span>
                  {!past && d.state !== 'closed' && (
                    <span className="text-[10px] leading-none">{d.free}</span>
                  )}
                </button>
              );
            })}
      </div>
      <div className="flex flex-wrap gap-3 text-xs text-muted-foreground">
        <span className="flex items-center gap-1">
          <span className="size-3 rounded bg-success/30" /> Free
        </span>
        <span className="flex items-center gap-1">
          <span className="size-3 rounded bg-amber-500/40" /> Few left
        </span>
        <span className="flex items-center gap-1">
          <span className="size-3 rounded bg-destructive/30" /> Full
        </span>
        <span className="flex items-center gap-1">
          <span className="size-3 rounded bg-muted" /> Closed
        </span>
      </div>
    </div>
  );
}

'use client';

import { Hash, Plus, X } from 'lucide-react';
import { useState } from 'react';
import { cn } from '@/shared/lib/utils';
import { Button } from '@/shared/ui/button';
import { useConfirm } from '@/shared/ui/confirm-dialog';
import { Input } from '@/shared/ui/input';

export interface SlotRow {
  key: string;
  id?: string;
  label: string;
  vehicleTypeId: string;
  /** false = kept for walk-ins / reserved, never given to app bookings. */
  isOnline: boolean;
}

const SHOW_FIRST = 60;
const k = () => Math.random().toString(36).slice(2);

/** Labels like P01…P20 from a prefix, first number, count and minimum digits. */
export function makeLabels(prefix: string, start: number, count: number, digits: number): string[] {
  return Array.from(
    { length: count },
    (_, i) => `${prefix}${String(start + i).padStart(digits, '0')}`,
  );
}

/** Next number after the highest trailing number already used (P07 → 8). */
function nextNumber(labels: string[]): number {
  const nums = labels
    .map((l) => Number(/(\d+)$/.exec(l)?.[1] ?? NaN))
    .filter((n) => !Number.isNaN(n));
  return nums.length ? Math.max(...nums) + 1 : 1;
}

/**
 * Named slots (P01, 001, A-12…) of one vehicle type on one floor. Optional: without them the floor works on counts.
 * Click a slot to switch it between bookable online and walk-in only; × removes it.
 */
export function SlotNumbers({
  vehicleTypeId,
  vehicleName,
  floorName,
  slots,
  allLabels,
  onChange,
}: {
  vehicleTypeId: string;
  vehicleName: string;
  floorName: string;
  /** This vehicle type's slots on the floor. */
  slots: SlotRow[];
  /** Every label on the floor (all vehicle types): names must be different on one floor. */
  allLabels: string[];
  onChange: (slots: SlotRow[]) => void;
}) {
  const ask = useConfirm();
  const [open, setOpen] = useState(false);
  const [showAll, setShowAll] = useState(false);
  const [prefix, setPrefix] = useState('P');
  const [start, setStart] = useState('');
  const [count, setCount] = useState('10');
  const [digits, setDigits] = useState('2');
  const [note, setNote] = useState<string | null>(null);

  const first =
    start === '' ? nextNumber(slots.map((s) => s.label)) : Math.max(0, Number(start) || 0);
  const n = Math.min(500, Math.max(0, Number(count) || 0));
  const preview = makeLabels(
    prefix.trim(),
    first,
    n,
    Math.min(6, Math.max(1, Number(digits) || 1)),
  );
  const online = slots.filter((s) => s.isOnline).length;
  const shown = showAll ? slots : slots.slice(0, SHOW_FIRST);

  const add = () => {
    const taken = new Set(allLabels.map((l) => l.toUpperCase()));
    const fresh = preview.filter((l) => !taken.has(l.toUpperCase()));
    onChange([
      ...slots,
      ...fresh.map((label) => ({ key: k(), label, vehicleTypeId, isOnline: true })),
    ]);
    setNote(
      fresh.length < preview.length
        ? `${preview.length - fresh.length} already existed and were skipped.`
        : null,
    );
    setStart('');
    setOpen(false);
  };

  return (
    <div className="grid gap-2 rounded-md border bg-card p-3">
      <div className="flex flex-wrap items-center justify-between gap-2">
        <p className="flex items-center gap-1.5 text-sm font-medium">
          <Hash className="size-4 text-muted-foreground" aria-hidden />
          {vehicleName} slot numbers
          <span className="font-normal text-muted-foreground">
            {slots.length
              ? `· ${slots.length} named, ${online} online${slots.length > online ? `, ${slots.length - online} walk-in` : ''}`
              : '· optional'}
          </span>
        </p>
        <div className="flex gap-1">
          <Button
            type="button"
            size="sm"
            variant="outline"
            className="h-8"
            onClick={() => setOpen((o) => !o)}
          >
            <Plus /> Add slot numbers
          </Button>
          {slots.length > 0 && (
            <Button
              type="button"
              size="sm"
              variant="ghost"
              className="h-8 text-destructive hover:text-destructive"
              onClick={async () =>
                (await ask({
                  title: `Remove all ${slots.length} ${vehicleName.toLowerCase()} slot numbers on ${floorName || 'this floor'}?`,
                  description:
                    'The floor goes back to plain slot counts. Nothing changes until you save.',
                  confirmLabel: 'Remove all',
                  tone: 'danger',
                })) && onChange([])
              }
            >
              Clear
            </Button>
          )}
        </div>
      </div>

      {open && (
        <div className="grid gap-3 rounded-md bg-muted/40 p-3">
          <div className="grid grid-cols-2 gap-3 sm:grid-cols-4">
            <label className="grid gap-1 text-xs font-medium text-muted-foreground">
              Prefix
              <Input
                value={prefix}
                maxLength={10}
                placeholder="P, B1-, A"
                onChange={(e) => setPrefix(e.target.value)}
                className="h-9"
              />
            </label>
            <label className="grid gap-1 text-xs font-medium text-muted-foreground">
              First number
              <Input
                type="number"
                min={0}
                value={start}
                placeholder={String(first)}
                onChange={(e) => setStart(e.target.value)}
                className="h-9"
              />
            </label>
            <label className="grid gap-1 text-xs font-medium text-muted-foreground">
              How many
              <Input
                type="number"
                min={1}
                max={500}
                value={count}
                onChange={(e) => setCount(e.target.value)}
                className="h-9"
              />
            </label>
            <label className="grid gap-1 text-xs font-medium text-muted-foreground">
              Digits
              <Input
                type="number"
                min={1}
                max={6}
                value={digits}
                onChange={(e) => setDigits(e.target.value)}
                className="h-9"
              />
            </label>
          </div>
          <div className="flex flex-wrap items-center justify-between gap-2 text-sm">
            <span className="text-muted-foreground">
              {n > 0 ? (
                <>
                  Adds <b className="text-foreground">{preview[0]}</b>
                  {n > 1 && (
                    <>
                      {' '}
                      to <b className="text-foreground">{preview[n - 1]}</b>
                    </>
                  )}{' '}
                  ({n} slot{n === 1 ? '' : 's'})
                </>
              ) : (
                'Enter how many slots to add'
              )}
            </span>
            <div className="flex gap-2">
              <Button type="button" size="sm" variant="ghost" onClick={() => setOpen(false)}>
                Cancel
              </Button>
              <Button type="button" size="sm" disabled={n === 0} onClick={add}>
                Add {n > 0 ? n : ''}
              </Button>
            </div>
          </div>
        </div>
      )}
      {note && <p className="text-xs text-amber-600 dark:text-amber-400">{note}</p>}

      {slots.length > 0 ? (
        <>
          <div className="flex flex-wrap gap-1.5">
            {shown.map((s) => (
              <span
                key={s.key}
                className={cn(
                  'inline-flex items-center rounded-md border text-xs font-medium tabular-nums',
                  s.isOnline
                    ? 'border-primary/40 bg-primary/5'
                    : 'border-dashed bg-muted text-muted-foreground',
                )}
              >
                <button
                  type="button"
                  className="px-2 py-1"
                  title={
                    s.isOnline
                      ? 'Bookable online: click to keep for walk-ins'
                      : 'Walk-in only: click to make bookable online'
                  }
                  aria-label={`${s.label}: ${s.isOnline ? 'bookable online' : 'walk-in only'}. Toggle.`}
                  onClick={() =>
                    onChange(
                      slots.map((x) => (x.key === s.key ? { ...x, isOnline: !x.isOnline } : x)),
                    )
                  }
                >
                  {s.label}
                </button>
                <button
                  type="button"
                  className="border-l px-1 py-1 text-muted-foreground hover:text-destructive"
                  aria-label={`Remove slot ${s.label}`}
                  onClick={() => onChange(slots.filter((x) => x.key !== s.key))}
                >
                  <X className="size-3" />
                </button>
              </span>
            ))}
            {slots.length > SHOW_FIRST && (
              <button
                type="button"
                className="px-2 text-xs underline"
                onClick={() => setShowAll((v) => !v)}
              >
                {showAll ? 'Show less' : `Show all ${slots.length}`}
              </button>
            )}
          </div>
          <p className="text-xs text-muted-foreground">
            Click a slot to switch it between <b>bookable online</b> and <b>walk-in only</b>{' '}
            (dashed). Total and online counts for {vehicleName.toLowerCase()}s on this floor now
            come from these slots.
          </p>
        </>
      ) : (
        <p className="text-xs text-muted-foreground">
          Give each space a number (P01, 001, A-12…) so customers can pick a slot and see where to
          park. Leave empty to use the slot counts above.
        </p>
      )}
    </div>
  );
}

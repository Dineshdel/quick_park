'use client';

import type { SelfServiceRole } from '@qp/types';
import { Building2, Car } from 'lucide-react';
import { cn } from '@/shared/lib/utils';

const OPTIONS: { value: SelfServiceRole; label: string; description: string; Icon: typeof Car }[] = [
  { value: 'VEHICLE_OWNER', label: 'I park vehicles', description: 'Find, book and pay for parking', Icon: Car },
  { value: 'PARKING_OWNER', label: 'I own a parking place', description: 'List places and manage entry/exit', Icon: Building2 },
];

export function RolePicker({ value, onChange }: { value?: SelfServiceRole; onChange: (v: SelfServiceRole) => void }) {
  return (
    <div role="radiogroup" aria-label="Account type" className="grid gap-3 sm:grid-cols-2">
      {OPTIONS.map(({ value: v, label, description, Icon }) => (
        <button
          key={v}
          type="button"
          role="radio"
          aria-checked={value === v}
          onClick={() => onChange(v)}
          className={cn(
            'flex flex-col items-start gap-1 rounded-md border p-4 text-left transition-colors hover:bg-accent',
            value === v && 'border-primary ring-2 ring-primary/30',
          )}
        >
          <Icon className="size-5" aria-hidden />
          <span className="font-medium">{label}</span>
          <span className="text-sm text-muted-foreground">{description}</span>
        </button>
      ))}
    </div>
  );
}

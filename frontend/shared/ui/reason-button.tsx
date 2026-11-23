'use client';

import { useState } from 'react';
import { Button, type ButtonProps } from '@/shared/ui/button';
import { Input } from '@/shared/ui/input';

/** A button that first asks for a short reason inline (reject, suspend…). */
export function ReasonButton({ label, onConfirm, placeholder = 'Reason', variant = 'outline', size = 'sm' }: { label: string; onConfirm: (reason: string) => Promise<unknown> | void; placeholder?: string } & Pick<ButtonProps, 'variant' | 'size'>) {
  const [open, setOpen] = useState(false);
  const [reason, setReason] = useState('');
  const [busy, setBusy] = useState(false);
  if (!open) {
    return (
      <Button type="button" variant={variant} size={size} onClick={() => setOpen(true)}>
        {label}
      </Button>
    );
  }
  return (
    <form
      className="flex flex-wrap items-center gap-2"
      onSubmit={async (e) => {
        e.preventDefault();
        if (reason.trim().length < 3) return;
        setBusy(true);
        try {
          await onConfirm(reason.trim());
          setOpen(false);
          setReason('');
        } finally {
          setBusy(false);
        }
      }}
    >
      <Input autoFocus value={reason} onChange={(e) => setReason(e.target.value)} placeholder={placeholder} className="h-8 w-56" aria-label={placeholder} />
      <Button type="submit" size="sm" variant="destructive" loading={busy} disabled={reason.trim().length < 3}>
        {label}
      </Button>
      <Button type="button" size="sm" variant="ghost" onClick={() => setOpen(false)}>
        Cancel
      </Button>
    </form>
  );
}

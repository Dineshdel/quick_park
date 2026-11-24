import * as React from 'react';
import { cn } from '@/shared/lib/utils';

export function Select({ className, ...props }: React.ComponentProps<'select'>) {
  return (
    <select
      className={cn(
        'h-10 w-full rounded-md border border-field-border bg-field px-3 text-sm text-foreground outline-none focus-visible:border-ring focus-visible:bg-card focus-visible:ring-[3px] focus-visible:ring-ring/50 disabled:opacity-50 aria-invalid:border-destructive',
        className,
      )}
      {...props}
    />
  );
}

export function Textarea({ className, ...props }: React.ComponentProps<'textarea'>) {
  return (
    <textarea
      className={cn(
        'flex min-h-20 w-full rounded-md border border-field-border bg-field px-3 py-2 text-sm text-foreground outline-none placeholder:text-muted-foreground focus-visible:border-ring focus-visible:bg-card focus-visible:ring-[3px] focus-visible:ring-ring/50 aria-invalid:border-destructive',
        className,
      )}
      {...props}
    />
  );
}

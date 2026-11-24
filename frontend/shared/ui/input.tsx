import * as React from 'react';
import { cn } from '@/shared/lib/utils';

export function Input({ className, ...props }: React.ComponentProps<'input'>) {
  return (
    <input
      className={cn(
        'flex h-10 w-full rounded-lg border border-field-border bg-field px-3 py-2 text-base shadow-xs outline-none transition-[color,box-shadow] placeholder:text-muted-foreground focus-visible:border-ring focus-visible:bg-card focus-visible:ring-[3px] focus-visible:ring-ring/50 disabled:cursor-not-allowed disabled:opacity-50 aria-invalid:border-destructive md:text-sm',
        className,
      )}
      {...props}
    />
  );
}

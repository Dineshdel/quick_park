import { cva, type VariantProps } from 'class-variance-authority';
import * as React from 'react';
import { cn } from '@/shared/lib/utils';

const badgeVariants = cva('inline-flex items-center rounded-full px-2 py-0.5 text-xs font-medium whitespace-nowrap', {
  variants: {
    variant: {
      default: 'bg-muted text-foreground',
      success: 'bg-success/15 text-success',
      warning: 'bg-amber-500/15 text-amber-700 dark:text-amber-400',
      danger: 'bg-destructive/15 text-destructive',
      info: 'bg-sky-500/15 text-sky-700 dark:text-sky-400',
      muted: 'bg-muted text-muted-foreground',
    },
  },
  defaultVariants: { variant: 'default' },
});

export function Badge({ className, variant, ...props }: React.ComponentProps<'span'> & VariantProps<typeof badgeVariants>) {
  return <span className={cn(badgeVariants({ variant }), className)} {...props} />;
}

const BOOKING_VARIANT = {
  PENDING_PAYMENT: 'warning',
  CONFIRMED: 'info',
  ACTIVE: 'success',
  COMPLETED: 'muted',
  CANCELLED: 'danger',
  EXPIRED: 'muted',
  DRAFT: 'muted',
  PENDING: 'warning',
  SUSPENDED: 'danger',
  ARCHIVED: 'muted',
  NOT_SUBMITTED: 'muted',
  APPROVED: 'success',
  REJECTED: 'danger',
  OPEN: 'warning',
  RESOLVED: 'success',
  PAID: 'success',
  CREATED: 'muted',
  FAILED: 'danger',
  PROCESSED: 'success',
} as const;

export function StatusPill({ status, label }: { status: string; label?: string }) {
  const variant = (BOOKING_VARIANT as Record<string, VariantProps<typeof badgeVariants>['variant']>)[status] ?? 'default';
  return <Badge variant={variant}>{label ?? status.charAt(0) + status.slice(1).toLowerCase().replace(/_/g, ' ')}</Badge>;
}

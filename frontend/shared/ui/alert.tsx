import { cva, type VariantProps } from 'class-variance-authority';
import * as React from 'react';
import { cn } from '@/shared/lib/utils';

const alertVariants = cva('rounded-md border px-4 py-3 text-sm', {
  variants: {
    variant: {
      default: 'bg-card text-card-foreground',
      destructive: 'border-destructive/50 text-destructive',
      success: 'border-success/50 text-success',
    },
  },
  defaultVariants: { variant: 'default' },
});

export function Alert({
  className,
  variant,
  ...props
}: React.ComponentProps<'div'> & VariantProps<typeof alertVariants>) {
  return <div role="alert" className={cn(alertVariants({ variant }), className)} {...props} />;
}

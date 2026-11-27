import { Slot } from '@radix-ui/react-slot';
import { cva, type VariantProps } from 'class-variance-authority';
import { Loader2 } from 'lucide-react';
import * as React from 'react';
import { cn } from '@/shared/lib/utils';

const buttonVariants = cva(
  'inline-flex items-center justify-center gap-2 whitespace-nowrap rounded-lg text-sm font-medium transition-all active:scale-[0.98] disabled:pointer-events-none disabled:opacity-50 outline-none focus-visible:ring-[3px] focus-visible:ring-ring/50 [&_svg]:size-4 [&_svg]:shrink-0',
  {
    variants: {
      variant: {
        default:
          'qp-shine sheen-3d edge-3d bg-primary text-primary-foreground hover:-translate-y-px hover:brightness-110 active:translate-y-px',
        gold: 'qp-shine edge-3d bg-gold-gradient font-semibold text-gold-foreground hover:brightness-105 hover:-translate-y-px active:translate-y-px',
        destructive: 'bg-destructive text-white hover:bg-destructive/90',
        outline:
          'edge-3d-soft border border-input bg-card hover:-translate-y-px hover:border-primary/30 hover:bg-accent hover:text-accent-foreground active:translate-y-px',
        secondary: 'bg-secondary text-secondary-foreground hover:bg-secondary/80',
        ghost: 'hover:bg-accent hover:text-accent-foreground',
        link: 'text-primary underline-offset-4 hover:underline',
      },
      size: {
        default: 'h-10 px-4 py-2',
        sm: 'h-8 rounded-md px-3',
        lg: 'h-12 rounded-lg px-7 text-base',
        icon: 'size-10',
      },
    },
    defaultVariants: { variant: 'default', size: 'default' },
  },
);

export interface ButtonProps
  extends React.ComponentProps<'button'>,
    VariantProps<typeof buttonVariants> {
  asChild?: boolean;
  loading?: boolean;
}

export function Button({
  className,
  variant,
  size,
  asChild,
  loading,
  disabled,
  children,
  ...props
}: ButtonProps) {
  const Comp = asChild ? Slot : 'button';
  return (
    <Comp
      className={cn(buttonVariants({ variant, size, className }))}
      disabled={disabled || loading}
      {...props}
    >
      {asChild ? (
        children
      ) : (
        <>
          {loading && <Loader2 className="animate-spin" aria-hidden />}
          {children}
        </>
      )}
    </Comp>
  );
}

export { buttonVariants };

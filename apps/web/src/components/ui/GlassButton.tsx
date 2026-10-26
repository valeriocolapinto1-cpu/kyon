import { forwardRef, type ButtonHTMLAttributes } from 'react';
import { cn } from '@/lib/cn';

export type ButtonVariant = 'primary' | 'glass' | 'plain' | 'danger';
export type ButtonSize = 'md' | 'sm' | 'icon';

export interface GlassButtonProps extends ButtonHTMLAttributes<HTMLButtonElement> {
  variant?: ButtonVariant;
  size?: ButtonSize;
}

const variants: Record<ButtonVariant, string> = {
  primary: 'bg-accent-fill text-on-accent shadow-sm',
  glass: 'k-glass text-fg',
  plain: 'bg-transparent text-accent-text hover:bg-accent-soft',
  danger: 'bg-danger-fill text-on-danger shadow-sm',
};

const sizes: Record<ButtonSize, string> = {
  md: 'min-h-touch px-5 text-headline',
  sm: 'min-h-touch px-4 text-subhead font-semibold',
  icon: 'size-touch justify-center',
};

/** Buttons are always at least 44×44 px. */
export const GlassButton = forwardRef<HTMLButtonElement, GlassButtonProps>(function GlassButton(
  { variant = 'glass', size = 'md', className, type = 'button', ...props },
  ref,
) {
  return (
    <button
      ref={ref}
      type={type}
      className={cn(
        'k-pressable inline-flex items-center gap-2 rounded-pill font-semibold select-none',
        'disabled:cursor-not-allowed disabled:opacity-50',
        variants[variant],
        sizes[size],
        className,
      )}
      {...props}
    />
  );
});

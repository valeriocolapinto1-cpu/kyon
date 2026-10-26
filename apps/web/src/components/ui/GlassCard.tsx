import type { ComponentPropsWithoutRef, ElementType } from 'react';
import { cn } from '@/lib/cn';

type GlassCardProps<T extends ElementType> = {
  as?: T;
  /** Adds press feedback for clickable cards. */
  interactive?: boolean;
  padded?: boolean;
} & ComponentPropsWithoutRef<T>;

/** Glass surface for content. Text inside always sits on a surface with guaranteed AA contrast. */
export function GlassCard<T extends ElementType = 'div'>({
  as,
  interactive = false,
  padded = true,
  className,
  ...props
}: GlassCardProps<T>) {
  const Component: ElementType = as ?? 'div';
  return (
    <Component
      className={cn(
        'k-glass rounded-card',
        padded && 'p-4',
        interactive && 'k-pressable cursor-pointer',
        className,
      )}
      {...props}
    />
  );
}

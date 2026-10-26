import type { ReactNode } from 'react';
import { cn } from '@/lib/cn';

/**
 * List + detail. Phones show one of the two (the detail when `showDetail`); from tablet up
 * both columns sit side by side.
 */
export function SplitView({
  list,
  detail,
  showDetail = false,
  className,
}: {
  list: ReactNode;
  detail: ReactNode;
  showDetail?: boolean;
  className?: string;
}) {
  return (
    <div className={cn('grid gap-4 md:grid-cols-[minmax(16rem,22rem)_1fr]', className)}>
      <section className={cn('min-w-0', showDetail && 'hidden md:block')}>{list}</section>
      <section className={cn('min-w-0', showDetail ? 'block' : 'hidden md:block')}>
        {detail}
      </section>
    </div>
  );
}

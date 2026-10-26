import type { ReactNode } from 'react';
import { cn } from '@/lib/cn';

/**
 * List + detail. Phones show only the list (the detail is its own route or a sheet);
 * from tablet up both columns sit side by side.
 */
export function SplitView({
  list,
  detail,
  className,
}: {
  list: ReactNode;
  detail: ReactNode;
  className?: string;
}) {
  return (
    <div className={cn('grid gap-4 md:grid-cols-[minmax(16rem,22rem)_1fr]', className)}>
      <section className="min-w-0">{list}</section>
      <section className="hidden min-w-0 md:block">{detail}</section>
    </div>
  );
}

import { cn } from '@/lib/cn';
import { it } from '@/lib/i18n/it';

/** Loading placeholder. Decorative; the container announces "Caricamento…" once. */
export function Skeleton({ className }: { className?: string }) {
  return <span aria-hidden="true" className={cn('k-skeleton block rounded-control', className)} />;
}

export function SkeletonList({ rows = 3 }: { rows?: number }) {
  return (
    <div role="status" aria-live="polite" className="flex flex-col gap-3">
      <span className="sr-only">{it.common.loading}</span>
      {Array.from({ length: rows }, (_, i) => (
        <Skeleton key={i} className="h-16 w-full" />
      ))}
    </div>
  );
}

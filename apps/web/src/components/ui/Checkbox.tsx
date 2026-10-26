import { useId, type InputHTMLAttributes } from 'react';
import { cn } from '@/lib/cn';

/** Native checkbox with a full-row touch target. */
export function Checkbox({ label, className, ...props }: { label: string } & Omit<InputHTMLAttributes<HTMLInputElement>, 'type'>) {
  const id = useId();
  return (
    <label htmlFor={id} className={cn('flex min-h-touch cursor-pointer items-center gap-3 text-body text-fg', className)}>
      <input id={id} type="checkbox" className="size-5 shrink-0 accent-[var(--k-accent-fill)]" {...props} />
      {label}
    </label>
  );
}

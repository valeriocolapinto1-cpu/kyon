import { ChevronDown } from 'lucide-react';
import { forwardRef, useId, type SelectHTMLAttributes } from 'react';
import { cn } from '@/lib/cn';

export interface GlassSelectProps extends SelectHTMLAttributes<HTMLSelectElement> {
  label: string;
  hideLabel?: boolean;
  options: { value: string; label: string }[];
}

/** Native select (the system picker on iOS/Android), styled like GlassInput. */
export const GlassSelect = forwardRef<HTMLSelectElement, GlassSelectProps>(function GlassSelect(
  { label, hideLabel = false, options, className, id, ...props },
  ref,
) {
  const autoId = useId();
  const selectId = id ?? autoId;
  return (
    <div className={cn('flex flex-col gap-1', className)}>
      <label
        htmlFor={selectId}
        className={cn('text-subhead font-medium text-fg', hideLabel && 'sr-only')}
      >
        {label}
      </label>
      <div className="relative">
        <select
          ref={ref}
          id={selectId}
          className="min-h-touch w-full appearance-none rounded-control border border-input-border bg-surface-solid py-2 pr-10 pl-4 text-fg disabled:opacity-60"
          {...props}
        >
          {options.map((option) => (
            <option key={option.value} value={option.value}>
              {option.label}
            </option>
          ))}
        </select>
        <ChevronDown
          className="pointer-events-none absolute top-1/2 right-3 size-5 -translate-y-1/2 text-muted"
          aria-hidden="true"
        />
      </div>
    </div>
  );
});

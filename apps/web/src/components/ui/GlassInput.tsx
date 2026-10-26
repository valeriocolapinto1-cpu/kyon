import { forwardRef, useId, type InputHTMLAttributes } from 'react';
import { cn } from '@/lib/cn';

export interface GlassInputProps extends InputHTMLAttributes<HTMLInputElement> {
  label: string;
  /** Visually hide the label (it stays available to screen readers). */
  hideLabel?: boolean;
  hint?: string;
  error?: string;
}

export const GlassInput = forwardRef<HTMLInputElement, GlassInputProps>(function GlassInput(
  { label, hideLabel = false, hint, error, className, id, ...props },
  ref,
) {
  const autoId = useId();
  const inputId = id ?? autoId;
  const hintId = hint ? `${inputId}-hint` : undefined;
  const errorId = error ? `${inputId}-error` : undefined;
  return (
    <div className={cn('flex flex-col gap-1', className)}>
      <label
        htmlFor={inputId}
        className={cn('text-subhead font-medium text-fg', hideLabel && 'sr-only')}
      >
        {label}
      </label>
      <input
        ref={ref}
        id={inputId}
        aria-invalid={error ? true : undefined}
        aria-describedby={[hintId, errorId].filter(Boolean).join(' ') || undefined}
        className={cn(
          'min-h-touch w-full rounded-control border bg-surface-solid px-4 text-fg placeholder:text-muted',
          error ? 'border-danger' : 'border-input-border',
        )}
        {...props}
      />
      {hint && (
        <p id={hintId} className="text-footnote text-muted">
          {hint}
        </p>
      )}
      {error && (
        <p id={errorId} className="text-footnote font-medium text-danger">
          {error}
        </p>
      )}
    </div>
  );
});

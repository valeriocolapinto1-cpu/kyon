import { forwardRef, useId, type TextareaHTMLAttributes } from 'react';
import { cn } from '@/lib/cn';

export interface GlassTextareaProps extends TextareaHTMLAttributes<HTMLTextAreaElement> {
  label: string;
  hint?: string;
}

export const GlassTextarea = forwardRef<HTMLTextAreaElement, GlassTextareaProps>(
  function GlassTextarea({ label, hint, className, id, ...props }, ref) {
    const autoId = useId();
    const fieldId = id ?? autoId;
    const hintId = hint ? `${fieldId}-hint` : undefined;
    return (
      <div className={cn('flex flex-col gap-1', className)}>
        <label htmlFor={fieldId} className="text-subhead font-medium text-fg">
          {label}
        </label>
        <textarea
          ref={ref}
          id={fieldId}
          aria-describedby={hintId}
          className="min-h-24 w-full rounded-control border border-input-border bg-surface-solid px-4 py-3 text-fg placeholder:text-muted"
          {...props}
        />
        {hint && (
          <p id={hintId} className="text-footnote text-muted">
            {hint}
          </p>
        )}
      </div>
    );
  },
);

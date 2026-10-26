'use client';

import { Eye, EyeOff } from 'lucide-react';
import { forwardRef, useId, useState, type InputHTMLAttributes } from 'react';
import { cn } from '@/lib/cn';
import { it } from '@/lib/i18n/it';

interface PasswordFieldProps extends Omit<InputHTMLAttributes<HTMLInputElement>, 'type'> {
  label: string;
  hint?: string;
  error?: string;
}

export const PasswordField = forwardRef<HTMLInputElement, PasswordFieldProps>(
  function PasswordField({ label, hint, error, className, id, ...props }, ref) {
    const autoId = useId();
    const inputId = id ?? autoId;
    const [visible, setVisible] = useState(false);
    const describedBy = [hint ? `${inputId}-hint` : null, error ? `${inputId}-error` : null]
      .filter(Boolean)
      .join(' ');
    return (
      <div className={cn('flex flex-col gap-1', className)}>
        <label htmlFor={inputId} className="text-subhead font-medium text-fg">
          {label}
        </label>
        <div className="relative">
          <input
            ref={ref}
            id={inputId}
            type={visible ? 'text' : 'password'}
            aria-invalid={error ? true : undefined}
            aria-describedby={describedBy || undefined}
            autoCapitalize="none"
            autoCorrect="off"
            spellCheck={false}
            className={cn(
              'min-h-touch w-full rounded-control border bg-surface-solid py-2 pr-14 pl-4 text-fg placeholder:text-muted',
              error ? 'border-danger' : 'border-input-border',
            )}
            {...props}
          />
          <button
            type="button"
            onClick={() => setVisible((v) => !v)}
            aria-label={visible ? it.auth.hidePassword : it.auth.showPassword}
            aria-pressed={visible}
            className="absolute top-0 right-0 inline-flex size-touch items-center justify-center rounded-control text-muted hover:text-fg"
          >
            {visible ? (
              <EyeOff className="size-5" aria-hidden="true" />
            ) : (
              <Eye className="size-5" aria-hidden="true" />
            )}
          </button>
        </div>
        {hint && (
          <p id={`${inputId}-hint`} className="text-footnote text-muted">
            {hint}
          </p>
        )}
        {error && (
          <p id={`${inputId}-error`} className="text-footnote font-medium text-danger">
            {error}
          </p>
        )}
      </div>
    );
  },
);

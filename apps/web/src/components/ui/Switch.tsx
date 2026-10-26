'use client';

import * as SwitchPrimitive from '@radix-ui/react-switch';
import { useId } from 'react';
import { cn } from '@/lib/cn';

interface SwitchProps {
  label: string;
  help?: string;
  checked: boolean;
  onCheckedChange: (checked: boolean) => void;
}

/** Labelled iOS-style switch; the whole row is the touch target. */
export function Switch({ label, help, checked, onCheckedChange }: SwitchProps) {
  const id = useId();
  return (
    <div className="flex min-h-touch items-center justify-between gap-4">
      <div className="flex flex-col">
        <label htmlFor={id} className="text-body text-fg">
          {label}
        </label>
        {help && (
          <span id={`${id}-help`} className="text-footnote text-muted">
            {help}
          </span>
        )}
      </div>
      <SwitchPrimitive.Root
        id={id}
        checked={checked}
        onCheckedChange={onCheckedChange}
        aria-describedby={help ? `${id}-help` : undefined}
        className={cn(
          'relative inline-flex h-8 w-13 shrink-0 items-center rounded-pill border border-input-border p-0.5 transition-colors',
          checked ? 'bg-accent-fill' : 'bg-neutral-soft',
        )}
      >
        <SwitchPrimitive.Thumb className="block size-6 rounded-full bg-white shadow-md transition-transform duration-200 ease-spring data-[state=checked]:translate-x-5" />
      </SwitchPrimitive.Root>
    </div>
  );
}

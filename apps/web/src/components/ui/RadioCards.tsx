'use client';

import * as RadioGroup from '@radix-ui/react-radio-group';
import { Check } from 'lucide-react';
import { cn } from '@/lib/cn';

interface Option<T extends string> {
  value: T;
  label: string;
  description?: string;
}

/** Vertical list of choices with descriptions (arrow keys move between them). */
export function RadioCards<T extends string>({ label, value, options, onChange }: { label: string; value: T; options: Option<T>[]; onChange: (v: T) => void }) {
  return (
    <RadioGroup.Root aria-label={label} value={value} onValueChange={(v) => onChange(v as T)} className="flex flex-col gap-2">
      {options.map((option) => (
        <RadioGroup.Item
          key={option.value}
          value={option.value}
          className={cn(
            'k-pressable flex min-h-touch items-start gap-3 rounded-control border p-3 text-left',
            option.value === value ? 'border-accent-text bg-accent-soft' : 'border-separator bg-surface-solid',
          )}
        >
          <span
            aria-hidden="true"
            className={cn(
              'mt-0.5 inline-flex size-5 shrink-0 items-center justify-center rounded-full border-2',
              option.value === value ? 'border-accent-fill bg-accent-fill text-on-accent' : 'border-input-border',
            )}
          >
            {option.value === value && <Check className="size-3" strokeWidth={3} />}
          </span>
          <span>
            <span className="block text-body font-semibold text-fg">{option.label}</span>
            {option.description && <span className="block text-footnote text-muted">{option.description}</span>}
          </span>
        </RadioGroup.Item>
      ))}
    </RadioGroup.Root>
  );
}

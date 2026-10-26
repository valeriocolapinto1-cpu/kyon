'use client';

import * as RadioGroup from '@radix-ui/react-radio-group';
import { m } from 'motion/react';
import { useId } from 'react';
import { cn } from '@/lib/cn';

export interface SegmentedOption<T extends string> {
  value: T;
  label: string;
}

interface SegmentedProps<T extends string> {
  label: string;
  value: T;
  options: SegmentedOption<T>[];
  onChange: (value: T) => void;
  className?: string;
}

/** iOS-style segmented control. A radio group under the hood: arrow keys move the selection. */
export function Segmented<T extends string>({
  label,
  value,
  options,
  onChange,
  className,
}: SegmentedProps<T>) {
  const layoutId = useId();
  return (
    <RadioGroup.Root
      aria-label={label}
      value={value}
      onValueChange={(next) => onChange(next as T)}
      orientation="horizontal"
      className={cn('inline-flex rounded-pill bg-accent-soft p-1', className)}
    >
      {options.map((option) => {
        const selected = option.value === value;
        return (
          <RadioGroup.Item
            key={option.value}
            value={option.value}
            className={cn(
              'relative min-h-touch flex-1 rounded-pill px-4 text-subhead font-semibold',
              selected ? 'text-fg' : 'text-muted',
            )}
          >
            {selected && (
              <m.span
                layoutId={layoutId}
                className="absolute inset-0 rounded-pill bg-surface-solid shadow-sm"
                transition={{ type: 'spring', stiffness: 500, damping: 38 }}
              />
            )}
            <span className="relative">{option.label}</span>
          </RadioGroup.Item>
        );
      })}
    </RadioGroup.Root>
  );
}

'use client';

import * as RadioGroup from '@radix-ui/react-radio-group';
import { cn } from '@/lib/cn';
import { SlidingPill } from './SlidingPill';

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
  return (
    <RadioGroup.Root
      aria-label={label}
      value={value}
      onValueChange={(next) => onChange(next as T)}
      orientation="horizontal"
      className={cn(
        'relative flex w-full max-w-full rounded-pill bg-accent-soft p-1 sm:w-auto',
        className,
      )}
    >
      <SlidingPill
        index={options.findIndex((o) => o.value === value)}
        count={options.length}
        className="bg-surface-solid shadow-sm"
      />
      {options.map((option) => {
        const selected = option.value === value;
        return (
          <RadioGroup.Item
            key={option.value}
            value={option.value}
            className={cn(
              'relative min-h-touch min-w-0 flex-1 rounded-pill px-3 text-center text-subhead leading-tight font-semibold sm:px-4',
              selected ? 'text-fg' : 'text-muted',
            )}
          >
            <span className="relative">{option.label}</span>
          </RadioGroup.Item>
        );
      })}
    </RadioGroup.Root>
  );
}

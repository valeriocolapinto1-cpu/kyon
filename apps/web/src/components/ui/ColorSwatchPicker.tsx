'use client';

import * as RadioGroup from '@radix-ui/react-radio-group';
import { Check } from 'lucide-react';
import { ACCENT_IDS, ACCENTS, type AccentId } from '@kyon/core';
import { it } from '@/lib/i18n/it';
import { cn } from '@/lib/cn';

interface ColorSwatchPickerProps {
  label: string;
  value: AccentId | null;
  scheme: 'light' | 'dark';
  onChange: (accent: AccentId) => void;
}

/** Apple accent palette. Selected swatch shows a check mark (not color alone). */
export function ColorSwatchPicker({ label, value, scheme, onChange }: ColorSwatchPickerProps) {
  return (
    <RadioGroup.Root
      aria-label={label}
      value={value ?? ''}
      onValueChange={(next) => onChange(next as AccentId)}
      className="flex flex-wrap gap-2"
    >
      {ACCENT_IDS.map((accent) => {
        const selected = accent === value;
        return (
          <RadioGroup.Item
            key={accent}
            value={accent}
            aria-label={it.accents[accent]}
            title={it.accents[accent]}
            className={cn(
              'k-pressable relative inline-flex size-touch items-center justify-center rounded-full',
              selected && 'ring-2 ring-fg ring-offset-2 ring-offset-bg',
            )}
            style={{ backgroundColor: ACCENTS[accent][scheme] }}
          >
            {selected && (
              <span className="inline-flex size-6 items-center justify-center rounded-full bg-white text-black">
                <Check className="size-4" strokeWidth={3} aria-hidden="true" />
              </span>
            )}
          </RadioGroup.Item>
        );
      })}
    </RadioGroup.Root>
  );
}

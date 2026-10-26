'use client';

import { Check, Copy } from 'lucide-react';
import { useState } from 'react';
import { it } from '@/lib/i18n/it';
import { GlassButton } from './GlassButton';

/** Read-only value with a copy button (invite links, reset links). */
export function CopyField({ label, value }: { label: string; value: string }) {
  const [copied, setCopied] = useState(false);
  const copy = async () => {
    try {
      await navigator.clipboard.writeText(value);
      setCopied(true);
      window.setTimeout(() => setCopied(false), 2000);
    } catch (error) {
      console.warn('Clipboard write failed', error);
    }
  };
  return (
    <div className="flex flex-col gap-2">
      <label className="text-subhead font-medium text-fg">
        {label}
        <input
          readOnly
          value={value}
          onFocus={(e) => e.currentTarget.select()}
          className="mt-1 min-h-touch w-full rounded-control border border-input-border bg-surface-solid px-4 font-mono text-footnote text-fg"
        />
      </label>
      <GlassButton variant="primary" size="sm" onClick={copy} className="self-start">
        {copied ? (
          <Check className="size-4" aria-hidden="true" />
        ) : (
          <Copy className="size-4" aria-hidden="true" />
        )}
        <span aria-live="polite">{copied ? it.admin.copied : it.admin.copyLink}</span>
      </GlassButton>
    </div>
  );
}

'use client';

import { buildTheme, isAccentId, type AccentId } from '@kyon/core';
import type { ReactNode } from 'react';
import { usePreferences } from '@/lib/preferences/context';

const cache = new Map<string, string>();

/** Text color for a person's chosen name color: derived per theme so it always passes AA. */
function nameColorFor(accent: AccentId, scheme: 'light' | 'dark', contrast: 'normal' | 'high') {
  const key = `${accent}:${scheme}:${contrast}`;
  let color = cache.get(key);
  if (!color) {
    color = buildTheme({ accent, scheme, contrast }).tokens['accent-text'] ?? '';
    cache.set(key, color);
  }
  return color;
}

/** A person's name in the color they picked (default text color when they picked none). */
export function PersonName({
  color,
  className,
  children,
}: {
  color: string | null | undefined;
  className?: string;
  children: ReactNode;
}) {
  const { resolved } = usePreferences();
  const scheme = resolved['data-scheme'] === 'dark' ? 'dark' : 'light';
  const contrast = resolved['data-contrast'] === 'high' ? 'high' : 'normal';
  const style = isAccentId(color) ? { color: nameColorFor(color, scheme, contrast) } : undefined;
  return (
    <span className={className} style={style}>
      {children}
    </span>
  );
}

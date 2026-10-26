import type { MetadataRoute } from 'next';
import { DEFAULT_ACCENT, buildTheme } from '@kyon/core';
import { it } from '@/lib/i18n/it';

export default function manifest(): MetadataRoute.Manifest {
  const bg =
    buildTheme({ accent: DEFAULT_ACCENT, scheme: 'light', contrast: 'normal' }).tokens['bg'] ??
    '#F2F2F7';
  return {
    name: it.app.name,
    short_name: it.app.name,
    description: it.app.tagline,
    lang: 'it',
    start_url: '/',
    scope: '/',
    display: 'standalone',
    orientation: 'any',
    background_color: bg,
    theme_color: bg,
    icons: [
      { src: '/icons/icon-192.png', sizes: '192x192', type: 'image/png', purpose: 'any' },
      { src: '/icons/icon-512.png', sizes: '512x512', type: 'image/png', purpose: 'any' },
      {
        src: '/icons/icon-maskable-512.png',
        sizes: '512x512',
        type: 'image/png',
        purpose: 'maskable',
      },
    ],
  };
}

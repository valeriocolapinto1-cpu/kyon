import type { Metadata, Viewport } from 'next';
import type { ReactNode } from 'react';
import { DEFAULT_ACCENT, buildTheme } from '@kyon/core';
import { BOOT_SCRIPT } from '@/lib/preferences/boot';
import { PreferencesProvider } from '@/lib/preferences/context';
import { it } from '@/lib/i18n/it';
import './globals.css';

export const metadata: Metadata = {
  title: { default: it.app.name, template: `%s · ${it.app.name}` },
  description: it.app.tagline,
  applicationName: it.app.name,
  appleWebApp: { capable: true, title: it.app.name, statusBarStyle: 'default' },
  icons: {
    icon: [
      { url: '/icon.svg', type: 'image/svg+xml' },
      { url: '/icons/favicon-32.png', sizes: '32x32', type: 'image/png' },
    ],
    apple: [{ url: '/icons/apple-touch-icon.png', sizes: '180x180' }],
  },
};

export const viewport: Viewport = {
  width: 'device-width',
  initialScale: 1,
  viewportFit: 'cover',
  themeColor: [
    {
      media: '(prefers-color-scheme: light)',
      color:
        buildTheme({ accent: DEFAULT_ACCENT, scheme: 'light', contrast: 'normal' }).tokens['bg'] ??
        '#F2F2F7',
    },
    {
      media: '(prefers-color-scheme: dark)',
      color:
        buildTheme({ accent: DEFAULT_ACCENT, scheme: 'dark', contrast: 'normal' }).tokens['bg'] ??
        '#0B0B0F',
    },
  ],
};

export default function RootLayout({ children }: { children: ReactNode }) {
  return (
    // The boot script sets data-* attributes before hydration, hence suppressHydrationWarning.
    <html
      lang="it"
      data-accent={DEFAULT_ACCENT}
      data-scheme="light"
      data-contrast="normal"
      data-reduce-motion="off"
      data-reduce-transparency="off"
      data-lite="off"
      data-non-color="off"
      suppressHydrationWarning
    >
      <head>
        <script dangerouslySetInnerHTML={{ __html: BOOT_SCRIPT }} />
      </head>
      <body>
        <PreferencesProvider>{children}</PreferencesProvider>
      </body>
    </html>
  );
}

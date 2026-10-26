'use client';

import { LazyMotion, MotionConfig, domMax } from 'motion/react';
import { FolderKanban, Home, MessagesSquare, MoonStar, Search, Settings } from 'lucide-react';
import { useMemo, useState, type ReactNode } from 'react';
import { CommandPalette, type CommandItem } from '@/components/ui/CommandPalette';
import { ToastProvider } from '@/components/ui/Toast';
import { it } from '@/lib/i18n/it';
import { usePreferences } from '@/lib/preferences/context';
import { SidebarPill } from './SidebarPill';
import { TabBarPill } from './TabBarPill';
import { Logo } from './Logo';

/**
 * App frame: mesh background, navigation (tab bar on phones, floating sidebar elsewhere),
 * global search (Cmd/Ctrl+K) and toasts.
 */
export function AppShell({ children }: { children: ReactNode }) {
  const { resolved, update } = usePreferences();
  const [paletteOpen, setPaletteOpen] = useState(false);
  const reduceMotion = resolved['data-reduce-motion'] === 'on';

  const commands = useMemo<CommandItem[]>(
    () => [
      {
        id: 'home',
        label: it.nav.home,
        group: it.commandPalette.groupNavigate,
        href: '/',
        icon: <Home className="size-5" />,
      },
      {
        id: 'projects',
        label: it.nav.projects,
        group: it.commandPalette.groupNavigate,
        href: '/progetti',
        icon: <FolderKanban className="size-5" />,
      },
      {
        id: 'chat',
        label: it.nav.chat,
        group: it.commandPalette.groupNavigate,
        href: '/chat',
        icon: <MessagesSquare className="size-5" />,
      },
      {
        id: 'settings',
        label: it.nav.settings,
        group: it.commandPalette.groupNavigate,
        href: '/settings',
        icon: <Settings className="size-5" />,
      },
      {
        id: 'toggle-theme',
        label: it.commandPalette.toggleTheme,
        group: it.commandPalette.groupActions,
        keywords: ['scuro', 'chiaro', 'dark', 'light'],
        icon: <MoonStar className="size-5" />,
        run: () => update({ theme: resolved['data-scheme'] === 'dark' ? 'light' : 'dark' }),
      },
    ],
    [resolved, update],
  );

  return (
    <LazyMotion features={domMax} strict>
      <MotionConfig reducedMotion={reduceMotion ? 'always' : 'never'}>
        <ToastProvider>
          <a
            href="#contenuto"
            data-plain
            className="k-chrome fixed top-2 left-2 z-50 -translate-y-24 rounded-pill px-4 py-3 font-semibold text-fg focus:translate-y-0"
          >
            {it.app.skipToContent}
          </a>
          <div className="k-mesh" aria-hidden="true" />
          <SidebarPill onSearch={() => setPaletteOpen(true)} />
          <div className="min-h-dvh pt-[var(--k-safe-top)] pr-[var(--k-safe-right)] md:pl-32 phone-landscape:pl-24">
            <header className="mx-auto flex max-w-content items-center justify-between px-4 pt-3 md:hidden phone-landscape:hidden">
              <span className="flex items-center gap-2 text-headline text-fg">
                <Logo className="size-7" />
                {it.app.name}
              </span>
              <button
                type="button"
                onClick={() => setPaletteOpen(true)}
                aria-label={it.nav.searchHint}
                className="k-pressable k-glass flex size-touch items-center justify-center rounded-full text-fg"
              >
                <Search className="size-5" aria-hidden="true" />
              </button>
            </header>
            <main
              id="contenuto"
              tabIndex={-1}
              className="mx-auto max-w-content px-4 pt-4 pb-32 outline-none md:px-8 md:pt-8 md:pb-12"
            >
              {children}
            </main>
          </div>
          <TabBarPill />
          <CommandPalette open={paletteOpen} onOpenChange={setPaletteOpen} items={commands} />
        </ToastProvider>
      </MotionConfig>
    </LazyMotion>
  );
}

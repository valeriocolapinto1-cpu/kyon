'use client';

import dynamic from 'next/dynamic';
import {
  FolderKanban,
  History,
  Home,
  Keyboard,
  MessagesSquare,
  MoonStar,
  Search,
  Settings,
  Sparkles,
  Users,
} from 'lucide-react';
import { Suspense, useCallback, useEffect, useMemo, useState, type ReactNode } from 'react';
import type { CommandItem } from '@/components/ui/CommandPalette';
import { ToastProvider } from '@/components/ui/Toast';
import { it } from '@/lib/i18n/it';
import { usePreferences } from '@/lib/preferences/context';
import { GroupLiveProvider } from '@/lib/client/presence';
import { LocationTracker } from '@/lib/client/location';
import { useMe } from '@/lib/client/me';
import { NotificationBell } from '@/components/feature/notifications/NotificationBell';

const GlobalPalette = dynamic(() => import('@/components/feature/home/GlobalPalette'), {
  ssr: false,
});
const ShortcutsDialog = dynamic(
  () => import('@/components/feature/home/ShortcutsDialog').then((m) => m.ShortcutsDialog),
  { ssr: false },
);
const WelcomeTour = dynamic(
  () => import('@/components/feature/home/WelcomeTour').then((m) => m.WelcomeTour),
  { ssr: false },
);
import { useShellPanels, type ShellPanel } from '@/lib/client/shellEvents';
import { SidebarPill } from './SidebarPill';
import { TabBarPill } from './TabBarPill';
import { Logo } from './Logo';
import { PwaBridge } from './PwaBridge';

/**
 * App frame: mesh background, navigation (tab bar on phones, floating sidebar elsewhere),
 * global search (Cmd/Ctrl+K) and toasts.
 */
export function AppShell({ children }: { children: ReactNode }) {
  const { resolved, update } = usePreferences();
  const [paletteOpen, setPaletteOpenState] = useState(false);
  const [shortcutsOpen, setShortcutsOpen] = useState(false);
  const [tourOpen, setTourOpen] = useState(false);
  // Panels load their code the first time they're needed, not with every page.
  const [mounted, setMounted] = useState({ palette: false, shortcuts: false });
  const setPaletteOpen = useCallback((open: boolean) => {
    setPaletteOpenState(open);
    if (open) setMounted((m) => (m.palette ? m : { ...m, palette: true }));
  }, []);
  const openShortcuts = useCallback(() => {
    setShortcutsOpen(true);
    setMounted((m) => (m.shortcuts ? m : { ...m, shortcuts: true }));
  }, []);
  const me = useMe().data;

  // Cmd/Ctrl+K anywhere; "?" outside text fields.
  useEffect(() => {
    const onKey = (event: KeyboardEvent) => {
      if (event.key.toLowerCase() === 'k' && (event.metaKey || event.ctrlKey)) {
        event.preventDefault();
        setPaletteOpenState((open) => !open);
        setMounted((m) => (m.palette ? m : { ...m, palette: true }));
        return;
      }
      if (event.key !== '?' || event.metaKey || event.ctrlKey || event.altKey) return;
      const el = event.target as HTMLElement | null;
      const typing =
        el?.isContentEditable || ['INPUT', 'TEXTAREA', 'SELECT'].includes(el?.tagName ?? '');
      if (typing || document.querySelector('[role="dialog"]')) return;
      event.preventDefault();
      openShortcuts();
    };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [openShortcuts]);
  useShellPanels(
    useCallback(
      (panel: ShellPanel) => {
        if (panel === 'tour') setTourOpen(true);
        if (panel === 'shortcuts') openShortcuts();
        if (panel === 'search') setPaletteOpen(true);
      },
      [openShortcuts, setPaletteOpen],
    ),
  );

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
        id: 'people',
        label: it.commandPalette.people,
        group: it.commandPalette.groupNavigate,
        href: '/persone',
        icon: <Users className="size-5" />,
      },
      {
        id: 'activity',
        label: it.commandPalette.activity,
        group: it.commandPalette.groupNavigate,
        keywords: ['storico', 'attività'],
        href: '/attivita',
        icon: <History className="size-5" />,
      },
      {
        id: 'shortcuts',
        label: it.commandPalette.shortcuts,
        group: it.commandPalette.groupActions,
        keywords: ['tastiera', 'keyboard'],
        icon: <Keyboard className="size-5" />,
        run: openShortcuts,
      },
      {
        id: 'tour',
        label: it.commandPalette.tour,
        group: it.commandPalette.groupActions,
        keywords: ['benvenuto', 'guida'],
        icon: <Sparkles className="size-5" />,
        run: () => setTourOpen(true),
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
    [resolved, update, openShortcuts],
  );

  return (
    <>
      <ToastProvider>
        <GroupLiveProvider>
          <Suspense fallback={null}>
            <LocationTracker />
          </Suspense>
          <PwaBridge />
          <a
            href="#contenuto"
            data-plain
            className="k-chrome fixed top-2 left-2 z-50 -translate-y-24 rounded-pill px-4 py-3 font-semibold text-fg focus:translate-y-0"
          >
            {it.app.skipToContent}
          </a>
          <div className="k-mesh" aria-hidden="true" />
          <SidebarPill onSearch={() => setPaletteOpen(true)} bell={<NotificationBell />} />
          <div className="min-h-dvh pt-[var(--k-safe-top)] pr-[var(--k-safe-right)] md:pl-32 phone-landscape:pl-24">
            <header className="mx-auto flex max-w-content items-center justify-between px-4 pt-3 md:hidden phone-landscape:hidden">
              <span className="flex items-center gap-2 text-headline text-fg">
                <Logo className="size-7" />
                {it.app.name}
              </span>
              <span className="flex items-center gap-2">
                <NotificationBell className="k-glass" />
                <button
                  type="button"
                  onClick={() => setPaletteOpen(true)}
                  aria-label={it.nav.searchHint}
                  className="k-pressable k-glass flex size-touch items-center justify-center rounded-full text-fg"
                >
                  <Search className="size-5" aria-hidden="true" />
                </button>
              </span>
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
          {mounted.palette && (
            <GlobalPalette open={paletteOpen} onOpenChange={setPaletteOpen} commands={commands} />
          )}
          {mounted.shortcuts && (
            <ShortcutsDialog open={shortcutsOpen} onOpenChange={setShortcutsOpen} />
          )}
          {(tourOpen || (me && !me.tourDoneAt)) && (
            <WelcomeTour open={tourOpen} onOpenChange={setTourOpen} />
          )}
        </GroupLiveProvider>
      </ToastProvider>
    </>
  );
}

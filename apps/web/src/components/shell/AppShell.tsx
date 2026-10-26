'use client';

import { LazyMotion, MotionConfig, domMax } from 'motion/react';
import {
  CheckSquare,
  FileText,
  FolderKanban,
  History,
  Home,
  Keyboard,
  MessageSquareText,
  MessagesSquare,
  MoonStar,
  Search,
  Settings,
  Sparkles,
  Users,
} from 'lucide-react';
import { Suspense, useCallback, useMemo, useState, type ReactNode } from 'react';
import { CommandPalette, type CommandItem } from '@/components/ui/CommandPalette';
import { ToastProvider } from '@/components/ui/Toast';
import { it } from '@/lib/i18n/it';
import { usePreferences } from '@/lib/preferences/context';
import { GroupLiveProvider } from '@/lib/client/presence';
import { LocationTracker } from '@/lib/client/location';
import { messageHref, taskHref, useGlobalSearch } from '@/lib/client/home';
import { ShortcutsDialog } from '@/components/feature/home/ShortcutsDialog';
import { WelcomeTour } from '@/components/feature/home/WelcomeTour';
import { useShellPanels, type ShellPanel } from '@/lib/client/shellEvents';
import { SidebarPill } from './SidebarPill';
import { TabBarPill } from './TabBarPill';
import { Logo } from './Logo';

/**
 * App frame: mesh background, navigation (tab bar on phones, floating sidebar elsewhere),
 * global search (Cmd/Ctrl+K) and toasts.
 */
export function AppShell({ children }: { children: ReactNode }) {
  const { resolved, update } = usePreferences();
  const [paletteOpen, setPaletteOpenState] = useState(false);
  const [query, setQuery] = useState('');
  const [shortcutsOpen, setShortcutsOpen] = useState(false);
  const [tourOpen, setTourOpen] = useState(false);
  const setPaletteOpen = (open: boolean) => {
    setPaletteOpenState(open);
    if (!open) setQuery('');
  };
  useShellPanels(
    useCallback((panel: ShellPanel) => {
      if (panel === 'tour') setTourOpen(true);
      if (panel === 'shortcuts') setShortcutsOpen(true);
      if (panel === 'search') setPaletteOpenState(true);
    }, []),
  );
  const search = useGlobalSearch(paletteOpen ? query : '');
  const s = it.search;
  const remote: CommandItem[] = search.data
    ? [
        ...search.data.projects.map((p) => ({
          id: `project-${p.id}`,
          label: p.name,
          group: s.groupProjects,
          href: `/progetti?id=${encodeURIComponent(p.id)}`,
          icon: <FolderKanban className="size-5" />,
        })),
        ...search.data.tasks.map((t) => ({
          id: `task-${t.id}`,
          label: `${t.text}${t.done ? ` ${s.doneTask}` : ''} ${s.inProject(t.projectName)}`,
          group: s.groupTasks,
          href: taskHref(t.projectId, t.id),
          icon: <CheckSquare className="size-5" />,
        })),
        ...search.data.prompts.map((p) => ({
          id: `prompt-${p.id}`,
          label: `${p.title} ${s.inProject(p.projectName)}`,
          group: s.groupPrompts,
          href: `/progetti?id=${encodeURIComponent(p.projectId)}&tab=prompt&prompt=${encodeURIComponent(p.id)}`,
          icon: <FileText className="size-5" />,
        })),
        ...search.data.messages.map((m) => ({
          id: `message-${m.id}`,
          label: `${m.author?.name ?? it.chat.someone}: ${m.body.slice(0, 80)}`,
          group: s.groupMessages,
          href: messageHref(m.roomId, m.projectId, m.taskId),
          icon: <MessageSquareText className="size-5" />,
        })),
      ]
    : [];
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
        run: () => setShortcutsOpen(true),
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
    [resolved, update],
  );

  return (
    <LazyMotion features={domMax} strict>
      <MotionConfig reducedMotion={reduceMotion ? 'always' : 'never'}>
        <ToastProvider>
          <GroupLiveProvider>
            <Suspense fallback={null}>
              <LocationTracker />
            </Suspense>
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
            <CommandPalette
              open={paletteOpen}
              onOpenChange={setPaletteOpen}
              items={commands}
              query={query}
              onQueryChange={setQuery}
              remoteItems={remote}
              loading={search.isFetching}
            />
            <ShortcutsDialog open={shortcutsOpen} onOpenChange={setShortcutsOpen} />
            <WelcomeTour open={tourOpen} onOpenChange={setTourOpen} />
          </GroupLiveProvider>
        </ToastProvider>
      </MotionConfig>
    </LazyMotion>
  );
}

'use client';

import { useEffect, useState, type ReactNode } from 'react';
import { AccountSettings } from '@/components/feature/AccountSettings';
import { AdminPanel } from '@/components/feature/AdminPanel';
import { AppearanceSettings } from '@/components/feature/AppearanceSettings';
import { CalendarSettings } from '@/components/feature/CalendarSettings';
import { HelpSettings } from '@/components/feature/HelpSettings';
import { InstallSettings } from '@/components/feature/InstallSettings';
import { NotificationSettings } from '@/components/feature/NotificationSettings';
import { GitHubSettings } from '@/components/feature/GitHubSettings';
import { SessionsSettings } from '@/components/feature/SessionsSettings';
import { EmptyState } from '@/components/ui/EmptyState';
import { GlassButton } from '@/components/ui/GlassButton';
import { SkeletonList } from '@/components/ui/Skeleton';
import { useMe } from '@/lib/client/me';
import { cn } from '@/lib/cn';
import { it } from '@/lib/i18n/it';

type SectionKey =
  | 'appearance'
  | 'a11y'
  | 'github'
  | 'notifications'
  | 'calendar'
  | 'install'
  | 'help'
  | 'admin'
  | 'sessions'
  | 'account';

/** Section anchors (also used by links from other pages and notifications) → section. */
const ANCHORS: Record<string, SectionKey> = {
  'settings-appearance': 'appearance',
  'settings-a11y': 'a11y',
  github: 'github',
  'notifications-title': 'notifications',
  'calendar-title': 'calendar',
  'install-title': 'install',
  'help-title': 'help',
  'admin-title': 'admin',
  'health-title': 'admin',
  'sessions-title': 'sessions',
  'account-profile': 'account',
  'account-security': 'account',
};

const hashToSection = (hash: string): SectionKey | null => ANCHORS[hash.replace(/^#/, '')] ?? null;

/**
 * One section at a time, picked from the pills (graphics first, the account last): the page
 * stays short and only the section being used is mounted.
 */
export function SettingsView() {
  const me = useMe();
  const [section, setSection] = useState<SectionKey>('appearance');

  // Links like /settings#github open that section; reading the hash waits for the client.
  useEffect(() => {
    const fromHash = () => {
      // Coming back from GitHub (?github=…) lands on its section.
      const fromGitHub = new URLSearchParams(window.location.search).has('github');
      const next = fromGitHub ? 'github' : hashToSection(window.location.hash);
      if (next) setSection(next);
    };
    fromHash();
    window.addEventListener('hashchange', fromHash);
    return () => window.removeEventListener('hashchange', fromHash);
  }, []);

  const isAdmin = me.data?.role === 'admin';
  const tabs: { key: SectionKey; label: string }[] = [
    { key: 'appearance', label: it.settings.appearance },
    { key: 'a11y', label: it.settings.accessibility },
    { key: 'github', label: it.github.title },
    { key: 'notifications', label: it.notifications.settingsTitle },
    { key: 'calendar', label: it.calendar.title },
    { key: 'install', label: it.pwa.installTitle },
    { key: 'help', label: it.settings.help },
    ...(isAdmin ? [{ key: 'admin' as const, label: it.admin.title }] : []),
    { key: 'sessions', label: it.account.sessions },
    { key: 'account', label: it.account.title },
  ];
  const choose = (key: SectionKey) => {
    setSection(key);
    window.history.replaceState(null, '', `${window.location.pathname}#${key}`);
  };

  const needsAccount = section !== 'appearance' && section !== 'a11y';
  let body: ReactNode;
  if (!needsAccount)
    body = <AppearanceSettings part={section === 'a11y' ? 'a11y' : 'appearance'} />;
  else if (me.data) {
    const user = me.data;
    body = {
      github: <GitHubSettings me={user} />,
      notifications: <NotificationSettings />,
      calendar: <CalendarSettings />,
      install: <InstallSettings />,
      help: <HelpSettings />,
      admin: isAdmin ? <AdminPanel me={user} /> : null,
      sessions: <SessionsSettings />,
      account: <AccountSettings me={user} />,
    }[section as Exclude<SectionKey, 'appearance' | 'a11y'>];
  } else if (me.isError && (me.error as { status?: number }).status !== 401) {
    body = (
      <EmptyState
        title={it.common.errorTitle}
        body={me.error.message}
        action={
          <GlassButton variant="primary" onClick={() => me.refetch()}>
            {it.common.retry}
          </GlassButton>
        }
      />
    );
  } else body = <SkeletonList rows={3} />;

  return (
    <div className="flex flex-col gap-6">
      <nav
        aria-label={it.settings.title}
        className="-mx-4 -mt-2 flex snap-x gap-2 overflow-x-auto px-4 pb-1 md:mx-0 md:flex-wrap md:overflow-visible md:px-0"
      >
        {tabs.map((tab) => {
          const active = tab.key === section;
          return (
            <button
              key={tab.key}
              type="button"
              onClick={() => choose(tab.key)}
              aria-current={active ? 'page' : undefined}
              className={cn(
                'k-pressable inline-flex min-h-touch shrink-0 snap-start items-center justify-center rounded-pill px-4 text-center text-subhead font-semibold whitespace-nowrap',
                active ? 'bg-accent-fill text-on-accent' : 'bg-neutral-soft text-fg',
              )}
            >
              {tab.label}
            </button>
          );
        })}
      </nav>
      <div className="mx-auto flex w-full max-w-2xl flex-col gap-4">{body}</div>
    </div>
  );
}

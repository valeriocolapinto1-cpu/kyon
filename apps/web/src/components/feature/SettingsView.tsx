'use client';

import { AccountSettings } from '@/components/feature/AccountSettings';
import { AdminPanel } from '@/components/feature/AdminPanel';
import { AppearanceSettings } from '@/components/feature/AppearanceSettings';
import { CalendarSettings } from '@/components/feature/CalendarSettings';
import { HelpSettings } from '@/components/feature/HelpSettings';
import { NotificationSettings } from '@/components/feature/NotificationSettings';
import { GitHubSettings } from '@/components/feature/GitHubSettings';
import { SessionsSettings } from '@/components/feature/SessionsSettings';
import { Deferred, SectionPlaceholder } from '@/components/ui/Deferred';
import { EmptyState } from '@/components/ui/EmptyState';
import { GlassButton } from '@/components/ui/GlassButton';
import { SkeletonList } from '@/components/ui/Skeleton';
import { useMe } from '@/lib/client/me';
import { it } from '@/lib/i18n/it';

/**
 * Static sections (look, accessibility) come first, account data below: nothing jumps
 * around while the account loads.
 */
export function SettingsView() {
  const me = useMe();
  const links = [
    { href: '#settings-appearance', label: it.settings.appearance },
    { href: '#settings-a11y', label: it.settings.accessibility },
    { href: '#account-profile', label: it.account.profile },
    { href: '#github', label: it.github.title },
    { href: '#sessions-title', label: it.account.sessions },
    { href: '#notifications-title', label: it.notifications.settingsTitle },
    { href: '#calendar-title', label: it.calendar.title },
    { href: '#help-title', label: it.settings.help },
    ...(me.data?.role === 'admin' ? [{ href: '#admin-title', label: it.admin.title }] : []),
  ];
  return (
    <div className="flex flex-col gap-8">
      <nav aria-label={it.settings.title} className="-mt-2 flex flex-wrap gap-2">
        {links.map((link) => (
          <a
            key={link.href}
            href={link.href}
            data-plain
            className="k-pressable inline-flex min-h-touch items-center rounded-pill bg-neutral-soft px-4 text-subhead font-semibold text-fg"
          >
            {link.label}
          </a>
        ))}
      </nav>
      <AppearanceSettings />
      {me.data ? (
        <>
          <Deferred order={1}>
            <AccountSettings me={me.data} />
          </Deferred>
          {/* Below the fold: rendered when scrolled near (or at once for an #anchor). */}
          <Deferred
            when="visible"
            fallback={<SectionPlaceholder id="github" title={it.github.title} />}
          >
            <GitHubSettings me={me.data} />
          </Deferred>
          <Deferred
            when="visible"
            fallback={<SectionPlaceholder id="sessions-title" title={it.account.sessions} />}
          >
            <SessionsSettings />
          </Deferred>
          <Deferred
            when="visible"
            fallback={
              <SectionPlaceholder id="notifications-title" title={it.notifications.settingsTitle} />
            }
          >
            <NotificationSettings />
          </Deferred>
          <Deferred
            when="visible"
            fallback={<SectionPlaceholder id="calendar-title" title={it.calendar.title} />}
          >
            <CalendarSettings />
          </Deferred>
          <Deferred
            when="visible"
            fallback={<SectionPlaceholder id="help-title" title={it.settings.help} />}
          >
            <HelpSettings />
          </Deferred>
          {me.data.role === 'admin' && (
            <Deferred
              when="visible"
              fallback={<SectionPlaceholder id="admin-title" title={it.admin.title} />}
            >
              <AdminPanel me={me.data} />
            </Deferred>
          )}
        </>
      ) : me.isError && (me.error as { status?: number }).status !== 401 ? (
        <EmptyState
          title={it.common.errorTitle}
          body={me.error.message}
          action={
            <GlassButton variant="primary" onClick={() => me.refetch()}>
              {it.common.retry}
            </GlassButton>
          }
        />
      ) : (
        <SkeletonList rows={3} />
      )}
    </div>
  );
}

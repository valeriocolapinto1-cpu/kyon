'use client';

import Link from 'next/link';
import {
  Activity,
  ArrowRight,
  CalendarClock,
  History,
  MessageSquareText,
  PlayCircle,
  SlidersHorizontal,
  Users,
  X,
} from 'lucide-react';
import { useState, type ReactNode } from 'react';
import { today, type HomeBlockId, type Priority, type RunState } from '@kyon/core';
import dynamic from 'next/dynamic';
import { RunStateBadge } from '@/components/feature/prompts/RunState';
import { Avatar } from '@/components/ui/Avatar';
import { EmptyState } from '@/components/ui/EmptyState';
import { GlassButton } from '@/components/ui/GlassButton';
import { GlassCard } from '@/components/ui/GlassCard';
import { InlineText } from '@/components/ui/InlineText';
import { PageHeader } from '@/components/ui/PageHeader';
import { PriorityBadge } from '@/components/ui/PriorityBadge';
import { SkeletonList } from '@/components/ui/Skeleton';
import {
  messageHref,
  taskHref,
  useHome,
  useHomeLayout,
  usePeople,
  type HomeData,
} from '@/lib/client/home';
import { readLocalLocation } from '@/lib/client/location';
import { useInstallReminder } from '@/lib/client/pwa';
import { useMe } from '@/lib/client/me';
import { useGroupLive } from '@/lib/client/presence';
import { formatDayShort } from '@/lib/format/day';
import { relativeTime } from '@/lib/format/relative';
import { it } from '@/lib/i18n/it';
import { ActivityLine } from './ActivityLine';

const h = it.home;
const CustomizeSheet = dynamic(() => import('./CustomizeSheet'), { ssr: false });

const ICONS: Record<HomeBlockId, typeof Activity> = {
  contributions: Activity,
  myTasks: CalendarClock,
  runs: PlayCircle,
  comments: MessageSquareText,
  online: Users,
};

function Block({
  id,
  children,
  footer,
}: {
  id: HomeBlockId;
  children: ReactNode;
  footer?: ReactNode;
}) {
  const Icon = ICONS[id];
  return (
    <GlassCard as="section" aria-labelledby={`home-${id}`} className="flex flex-col gap-3">
      <h2 id={`home-${id}`} className="flex items-center gap-2 text-headline text-fg">
        <Icon className="size-5 text-accent-text" aria-hidden="true" />
        {h.blocks[id]}
      </h2>
      {children}
      {footer}
    </GlassCard>
  );
}

const Empty = ({ id }: { id: string }) => <p className="text-subhead text-muted">{h.empty[id]}</p>;

function MoreLink({ href, children }: { href: string; children: ReactNode }) {
  return (
    <Link
      href={href}
      className="mt-auto inline-flex min-h-touch items-center gap-1 self-start text-subhead font-semibold text-accent-text"
    >
      {children} <ArrowRight className="size-4" aria-hidden="true" />
    </Link>
  );
}

function DueLabel({ day, todayDay }: { day: string | null; todayDay: string }) {
  if (!day) return <span className="text-muted">{h.noDue}</span>;
  if (day < todayDay) return <span className="font-semibold text-danger">{h.overdue}</span>;
  if (day === todayDay) return <span className="font-semibold text-warning">{h.dueToday}</span>;
  return <span className="text-muted">{h.due(formatDayShort(day))}</span>;
}

function MyTasks({ data }: { data: HomeData }) {
  const [todayDay] = useState(() => today());
  if (!data.myTasks.length) return <Empty id="myTasks" />;
  return (
    <ul className="flex flex-col gap-1">
      {data.myTasks.map((t) => (
        <li key={t.id}>
          <Link
            href={taskHref(t.projectId, t.id)}
            className="flex min-h-touch items-center gap-3 rounded-control px-2 py-1 hover:bg-neutral-soft"
          >
            <PriorityBadge priority={t.priority as Priority} />
            <span className="min-w-0 flex-1">
              <span className="block truncate text-subhead text-fg">
                <InlineText text={t.text} />
              </span>
              <span className="block text-footnote">
                <span className="text-muted">{t.projectName} · </span>
                <DueLabel day={t.dueDate} todayDay={todayDay} />
              </span>
            </span>
          </Link>
        </li>
      ))}
    </ul>
  );
}

function Runs({ data }: { data: HomeData }) {
  if (!data.runs.length) return <Empty id="runs" />;
  return (
    <ul className="flex flex-col gap-1">
      {data.runs.map((r) => (
        <li key={r.id}>
          <Link
            href={`/progetti?id=${encodeURIComponent(r.projectId)}&tab=prompt`}
            className="flex min-h-touch flex-col rounded-control px-2 py-1 hover:bg-neutral-soft"
          >
            <span className="truncate text-subhead text-fg">
              <InlineText text={r.taskText} />
            </span>
            <span className="flex flex-wrap items-center gap-x-2 text-footnote text-muted">
              <RunStateBadge state={r.state as RunState} prNumber={r.prNumber} compact />
              <span>
                {r.projectName} · {r.launchedBy?.name ?? '—'} · {relativeTime(r.copiedAt)}
              </span>
            </span>
          </Link>
        </li>
      ))}
    </ul>
  );
}

function Comments({ data }: { data: HomeData }) {
  if (!data.comments.length) return <Empty id="comments" />;
  return (
    <ul className="flex flex-col gap-2">
      {data.comments.map((m) => (
        <li key={m.id}>
          <Link
            href={messageHref(m.roomId, m.projectId, m.taskId)}
            className="flex gap-3 rounded-control border border-border bg-surface-solid p-3 hover:bg-neutral-soft"
          >
            <Avatar name={m.author?.name ?? '?'} src={m.author?.avatarUrl} size="sm" />
            <span className="min-w-0 flex-1">
              <span className="block text-footnote text-muted">
                <span className="font-semibold text-fg">{m.author?.name ?? it.chat.someone}</span>
                {m.context ? ` ${h.commentOn(m.context)}` : ''} · {relativeTime(m.createdAt)}
              </span>
              <span className="line-clamp-2 block text-subhead text-fg">{m.excerpt}</span>
              <span className="block text-caption text-muted">{m.projectName}</span>
            </span>
          </Link>
        </li>
      ))}
    </ul>
  );
}

function Online() {
  const people = usePeople();
  const { online } = useGroupLive();
  const me = useMe().data;
  if (!people.data) return <SkeletonList rows={2} />;
  const sorted = [...people.data].sort(
    (a, b) => Number(online.includes(b.id)) - Number(online.includes(a.id)),
  );
  const count = sorted.filter((p) => p.id !== me?.id && online.includes(p.id)).length;
  return (
    <>
      <p className="text-footnote text-muted">{h.onlineCount(count)}</p>
      <ul className="flex flex-col gap-1">
        {sorted.map((p) => {
          const isOnline = online.includes(p.id);
          return (
            <li key={p.id}>
              <Link
                href={`/persone?id=${encodeURIComponent(p.id)}`}
                className="flex min-h-touch items-center gap-3 rounded-control px-2 py-1 hover:bg-neutral-soft"
              >
                <Avatar name={p.name} src={p.avatarUrl} size="sm" online={isOnline} />
                <span className="min-w-0 flex-1">
                  <span className="block text-subhead text-fg">
                    {p.name}
                    {p.id === me?.id ? ` (${it.people.you})` : ''}
                  </span>
                  <span className="block truncate text-footnote text-muted">
                    {isOnline ? h.online : h.offline}
                    {p.statusText ? ` · ${p.statusText}` : ''}
                  </span>
                </span>
              </Link>
            </li>
          );
        })}
      </ul>
    </>
  );
}

function Resume({ data }: { data: HomeData }) {
  const [hidden, setHidden] = useState(false);
  // This device's last place wins when it's newer (or the server copy is missing).
  const [local] = useState(() => readLocalLocation());
  const server = data.lastLocation;
  const pick =
    local && (!server?.at || (local.at && local.at > server.at)) ? local : (server ?? null);
  if (hidden || !pick || pick.path === '/') return null;
  return (
    <GlassCard
      as="section"
      aria-labelledby="home-resume"
      className="mb-4 flex items-center gap-3 py-2"
    >
      <History className="size-5 shrink-0 text-accent-text" aria-hidden="true" />
      <h2 id="home-resume" className="sr-only">
        {h.resumeTitle}
      </h2>
      <Link
        href={pick.path}
        className="flex min-h-touch min-w-0 flex-1 items-center text-subhead font-semibold text-accent-text"
      >
        <span className="truncate">{h.resume(pick.title || pick.path)}</span>
      </Link>
      <button
        type="button"
        onClick={() => setHidden(true)}
        aria-label={h.dismissResume}
        className="inline-flex size-touch shrink-0 items-center justify-center rounded-full text-muted"
      >
        <X className="size-4" aria-hidden="true" />
      </button>
    </GlassCard>
  );
}

/** Discreet reminder to install the app, after a few days of use (this device only). */
function InstallReminder() {
  const { show, dismiss } = useInstallReminder();
  if (!show) return null;
  return (
    <GlassCard
      as="aside"
      aria-label={it.pwa.installTitle}
      className="mb-4 flex flex-wrap items-center gap-3 py-2"
    >
      <p className="min-w-0 flex-1 text-subhead text-fg">{it.pwa.reminder}</p>
      <Link
        href="/settings#install-title"
        className="inline-flex min-h-touch items-center text-subhead font-semibold text-accent-text"
      >
        {it.pwa.reminderHow}
      </Link>
      <GlassButton size="sm" variant="plain" onClick={dismiss}>
        {it.pwa.reminderOff}
      </GlassButton>
    </GlassCard>
  );
}

/** Home: blocks in the order (and visibility) the person chose, each with its own empty state. */
export function HomeView() {
  const me = useMe().data;
  const home = useHome();
  const { layout } = useHomeLayout(me);
  // null until first opened: the sheet's code loads only then.
  const [customizing, setCustomizing] = useState<boolean | null>(null);

  const content = (id: HomeBlockId, data: HomeData) => {
    switch (id) {
      case 'contributions':
        return (
          <Block key={id} id={id} footer={<MoreLink href="/attivita">{h.allActivity}</MoreLink>}>
            {data.contributions.length ? (
              <ul className="flex flex-col gap-3">
                {data.contributions.slice(0, 6).map((e) => (
                  <ActivityLine key={e.id} event={e} />
                ))}
              </ul>
            ) : (
              <Empty id="contributions" />
            )}
          </Block>
        );
      case 'myTasks':
        return (
          <Block key={id} id={id}>
            <MyTasks data={data} />
          </Block>
        );
      case 'runs':
        return (
          <Block key={id} id={id}>
            <Runs data={data} />
          </Block>
        );
      case 'comments':
        return (
          <Block key={id} id={id}>
            <Comments data={data} />
          </Block>
        );
      case 'online':
        return (
          <Block key={id} id={id} footer={<MoreLink href="/persone">{h.allPeople}</MoreLink>}>
            <Online />
          </Block>
        );
    }
  };

  return (
    <>
      <PageHeader
        title={h.title}
        subtitle={h.subtitle}
        actions={
          <GlassButton size="sm" variant="glass" onClick={() => setCustomizing(true)}>
            <SlidersHorizontal className="size-4" aria-hidden="true" /> {h.customize}
          </GlassButton>
        }
      />
      {home.data && <Resume data={home.data} />}
      <InstallReminder />
      {home.isError ? (
        <EmptyState
          title={it.common.errorTitle}
          body={home.error.message}
          action={
            <GlassButton variant="primary" onClick={() => home.refetch()}>
              {it.common.retry}
            </GlassButton>
          }
        />
      ) : (
        <div className="grid gap-4 sm:grid-cols-2 xl:grid-cols-3">
          {layout
            .filter((b) => !b.hidden)
            .map((b) =>
              home.data || b.id === 'online' ? (
                content(b.id, home.data ?? EMPTY)
              ) : (
                <GlassCard key={b.id} aria-hidden="true">
                  <SkeletonList rows={3} />
                </GlassCard>
              ),
            )}
        </div>
      )}
      {customizing !== null && <CustomizeSheet open={customizing} onOpenChange={setCustomizing} />}
    </>
  );
}

const EMPTY: HomeData = {
  contributions: [],
  myTasks: [],
  runs: [],
  comments: [],
  lastLocation: null,
};

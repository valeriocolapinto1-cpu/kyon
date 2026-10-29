'use client';

import { ExternalLink } from 'lucide-react';
import Link from 'next/link';
import { Avatar } from '@/components/ui/Avatar';
import { EmptyState } from '@/components/ui/EmptyState';
import { GlassCard } from '@/components/ui/GlassCard';
import { InlineText } from '@/components/ui/InlineText';
import { SkeletonList } from '@/components/ui/Skeleton';
import { useProject } from '@/lib/client/projects';
import { useTasks } from '@/lib/client/tasks';
import { relativeTime } from '@/lib/format/relative';
import { it } from '@/lib/i18n/it';

const o = it.projects2.overview;
const NEXT_TASKS = 3;

function Stat({ label, value }: { label: string; value: number }) {
  return (
    <div className="flex flex-col rounded-control bg-neutral-soft p-3">
      <span className="text-title2 font-bold text-fg">{value}</span>
      <span className="text-footnote text-muted">{label}</span>
    </div>
  );
}

/** What the side panel shows when a project is picked in the list: a summary and the way in. */
export function ProjectOverview({ id }: { id: string }) {
  const project = useProject(id);
  const tasks = useTasks(id);
  if (project.isPending) return <SkeletonList rows={3} />;
  if (project.isError)
    return <EmptyState title={it.projects2.notFoundTitle} body={it.projects2.notFoundBody} />;
  const data = project.data;
  const all = (tasks.data?.files ?? []).filter((f) => f.kind === 'tasks').flatMap((f) => f.tasks);
  const inProgressColumns = new Set(
    (tasks.data?.columns ?? []).filter((c) => c.isInProgress).map((c) => c.id),
  );
  const open = all.filter((t) => !t.done);
  const inProgress = open.filter((t) => t.columnId && inProgressColumns.has(t.columnId));
  const upcoming = open.slice(0, NEXT_TASKS);

  return (
    <GlassCard as="section" aria-labelledby="overview-title" className="flex flex-col gap-4">
      <div className="min-w-0">
        <h2 id="overview-title" className="text-title2 font-bold text-fg">
          {data.name}
        </h2>
        <p className="text-footnote text-muted">{it.projects2.role[data.role]}</p>
        {data.repo && (
          <a
            href={data.repo.htmlUrl}
            target="_blank"
            rel="noreferrer"
            className="inline-flex items-center gap-1 text-footnote text-accent-text"
          >
            {data.repo.fullName} <ExternalLink className="size-3.5" aria-hidden="true" />
            <span className="sr-only">(si apre in una nuova scheda)</span>
          </a>
        )}
      </div>

      {tasks.isPending ? (
        <SkeletonList rows={2} />
      ) : (
        <div className="grid grid-cols-3 gap-2">
          <Stat label={o.open} value={open.length} />
          <Stat label={o.inProgress} value={inProgress.length} />
          <Stat label={o.done} value={all.length - open.length} />
        </div>
      )}

      {upcoming.length > 0 && (
        <div>
          <h3 className="mb-1 text-subhead font-semibold text-fg">{o.next}</h3>
          <ul className="flex flex-col gap-1">
            {upcoming.map((t) => (
              <li key={t.id} className="truncate text-subhead text-fg">
                <InlineText text={t.text} />
              </li>
            ))}
          </ul>
        </div>
      )}

      <div>
        <h3 className="mb-1 text-subhead font-semibold text-fg">{it.projects2.members}</h3>
        <ul className="flex flex-col gap-1">
          {data.members.map((m) => (
            <li key={m.id} className="flex items-center gap-2">
              <Avatar name={m.name} src={m.avatarUrl} size="sm" />
              <span className="min-w-0 flex-1 truncate text-subhead text-fg">{m.name}</span>
              <span className="text-footnote text-muted">{it.projects2.role[m.role]}</span>
            </li>
          ))}
        </ul>
      </div>

      {tasks.data?.sync.lastSyncAt && (
        <p className="text-footnote text-muted">
          {o.synced(relativeTime(tasks.data.sync.lastSyncAt))}
        </p>
      )}

      <Link
        href={`/progetti?id=${encodeURIComponent(data.id)}`}
        data-plain
        className="k-pressable inline-flex min-h-touch items-center gap-2 self-start rounded-pill bg-accent-fill px-5 font-semibold text-on-accent"
      >
        {o.enter}
      </Link>
    </GlassCard>
  );
}

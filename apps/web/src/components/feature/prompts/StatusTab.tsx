'use client';

import { useQueryClient } from '@tanstack/react-query';
import {
  CircleCheck,
  CircleDashed,
  CircleX,
  ExternalLink,
  GitCommitHorizontal,
  GitPullRequest,
  Loader2,
  RefreshCw,
  CircleDot,
  type LucideIcon,
} from 'lucide-react';
import { useState, type ReactNode } from 'react';
import { EmptyState } from '@/components/ui/EmptyState';
import { GlassButton } from '@/components/ui/GlassButton';
import { InlineText } from '@/components/ui/InlineText';
import { SkeletonList } from '@/components/ui/Skeleton';
import { useToast } from '@/components/ui/Toast';
import { ApiClientError, api } from '@/lib/client/api';
import { statusKey } from '@/lib/client/projectLive';
import type { ProjectDetail } from '@/lib/client/projects';
import { useStatus, type StatusData, type StatusEvent } from '@/lib/client/prompts';
import { tasksKey } from '@/lib/client/tasks';
import { cn } from '@/lib/cn';
import { relativeTime } from '@/lib/format/relative';
import { it } from '@/lib/i18n/it';

const s = it.status;

const ciIcon: Record<string, { Icon: LucideIcon; tone: string }> = {
  none: { Icon: CircleDashed, tone: 'text-muted' },
  running: { Icon: Loader2, tone: 'text-warning' },
  failed: { Icon: CircleX, tone: 'text-danger' },
  passed: { Icon: CircleCheck, tone: 'text-success' },
};

function Ci({ state }: { state: keyof typeof s.ciState }) {
  const { Icon, tone } = ciIcon[state] ?? ciIcon.none ?? { Icon: CircleDashed, tone: '' };
  return (
    <span className={cn('inline-flex items-center gap-1 text-caption font-semibold', tone)}>
      <Icon
        className={cn('size-4', state === 'running' && 'motion-safe:animate-spin')}
        aria-hidden="true"
      />
      CI: {s.ciState[state]}
    </span>
  );
}

function Panel({ title, children }: { title: string; children: ReactNode }) {
  const id = `status-${title.replace(/\W+/g, '-').toLowerCase()}`;
  return (
    <section aria-labelledby={id} className="k-glass flex flex-col gap-3 rounded-card p-4">
      <h3 id={id} className="text-headline text-fg">
        {title}
      </h3>
      {children}
    </section>
  );
}

function ExternalRow({
  href,
  icon: Icon,
  title,
  meta,
  extra,
}: {
  href: string;
  icon: LucideIcon;
  title: string;
  meta: string;
  extra?: ReactNode;
}) {
  return (
    <li>
      <a
        href={href}
        target="_blank"
        rel="noreferrer"
        className="flex min-h-touch items-start gap-2 rounded-control px-2 py-1.5 hover:bg-neutral-soft"
      >
        <Icon className="mt-0.5 size-4 shrink-0 text-muted" aria-hidden="true" />
        <span className="min-w-0 flex-1">
          <span className="block text-subhead text-fg [overflow-wrap:anywhere]">{title}</span>
          <span className="flex flex-wrap items-center gap-2 text-caption text-muted">
            {meta}
            {extra}
          </span>
        </span>
        <ExternalLink className="mt-0.5 size-4 shrink-0 text-muted" aria-hidden="true" />
        <span className="sr-only">(si apre in una nuova scheda)</span>
      </a>
    </li>
  );
}

function EventLine({ event }: { event: StatusEvent }) {
  const text = typeof event.payload.text === 'string' ? event.payload.text : '';
  return (
    <li className="text-footnote text-fg">
      <span className="font-semibold">{event.actor?.name ?? it.tasks.history.github}</span>{' '}
      {s.event[event.type] ?? event.type}
      {text && (
        <>
          {' '}
          «<InlineText text={text} />»
        </>
      )}
      <span className="text-muted">
        {' · '}
        <time dateTime={event.createdAt}>{relativeTime(event.createdAt)}</time>
      </span>
    </li>
  );
}

function GithubPanels({ github }: { github: NonNullable<StatusData['github']> }) {
  return (
    <>
      <Panel title={`${s.ci} (${github.branch})`}>
        <Ci state={github.ci.state} />
        {github.ci.checks.length > 0 && (
          <ul className="flex flex-col gap-1 text-footnote text-fg">
            {github.ci.checks.map((c) => (
              <li key={c.name}>
                {c.name}: {c.conclusion ?? c.status}
              </li>
            ))}
          </ul>
        )}
      </Panel>
      <Panel title={s.pulls}>
        {github.pulls.length === 0 ? (
          <p className="text-subhead text-muted">{s.empty}</p>
        ) : (
          <ul className="flex flex-col">
            {github.pulls.map((pr) => (
              <ExternalRow
                key={pr.number}
                href={pr.url}
                icon={GitPullRequest}
                title={`#${pr.number} ${pr.title}`}
                meta={`${s.by(pr.author)} · ${relativeTime(pr.createdAt)}`}
                extra={pr.ci ? <Ci state={pr.ci} /> : undefined}
              />
            ))}
          </ul>
        )}
      </Panel>
      <Panel title={s.commits}>
        {github.commits.length === 0 ? (
          <p className="text-subhead text-muted">{s.empty}</p>
        ) : (
          <ul className="flex flex-col">
            {github.commits.map((c) => (
              <ExternalRow
                key={c.sha}
                href={c.url}
                icon={GitCommitHorizontal}
                title={c.message}
                meta={`${c.shortSha} · ${s.by(c.author)}${c.date ? ` · ${relativeTime(c.date)}` : ''}`}
              />
            ))}
          </ul>
        )}
      </Panel>
      <Panel title={s.issues}>
        {github.issues.length === 0 ? (
          <p className="text-subhead text-muted">{s.empty}</p>
        ) : (
          <ul className="flex flex-col">
            {github.issues.map((i) => (
              <ExternalRow
                key={i.number}
                href={i.url}
                icon={CircleDot}
                title={`#${i.number} ${i.title}`}
                meta={`${s.by(i.author)} · ${relativeTime(i.createdAt)}`}
              />
            ))}
          </ul>
        )}
      </Panel>
    </>
  );
}

/** The Status tab: CI, PRs, commits, issues from GitHub; completed tasks and history from Kyon. */
export function StatusTab({ project }: { project: ProjectDetail }) {
  const queryClient = useQueryClient();
  const { toast } = useToast();
  const status = useStatus(project.id);
  const [refreshing, setRefreshing] = useState(false);

  const refresh = async () => {
    setRefreshing(true);
    try {
      await api(`/api/projects/${project.id}/sync`, { method: 'POST' });
      const fresh = await api<StatusData>(`/api/projects/${project.id}/status?fresh=1`);
      queryClient.setQueryData(statusKey(project.id), fresh);
      void queryClient.invalidateQueries({ queryKey: tasksKey(project.id) });
      toast({ tone: 'success', title: s.refreshed });
    } catch (error) {
      toast({
        tone: 'error',
        title: error instanceof ApiClientError ? error.message : it.common.errorBody,
      });
    } finally {
      setRefreshing(false);
    }
  };

  if (status.isPending) return <SkeletonList rows={4} />;
  if (status.isError)
    return <EmptyState title={it.common.errorTitle} body={status.error.message} />;
  const data = status.data;

  return (
    <div className="flex flex-col gap-4">
      <GlassButton
        size="sm"
        className="self-start"
        onClick={() => void refresh()}
        disabled={refreshing}
      >
        <RefreshCw
          className={cn('size-4', refreshing && 'motion-safe:animate-spin')}
          aria-hidden="true"
        />
        {s.refresh}
      </GlassButton>
      {data.githubError && (
        <p role="status" className="text-subhead text-danger">
          {s.githubError} {data.githubError}
        </p>
      )}
      <div className="grid items-start gap-4 lg:grid-cols-2">
        {data.github ? (
          <GithubPanels github={data.github} />
        ) : (
          <p className="text-subhead text-muted">{s.noGithub}</p>
        )}
        <Panel title={s.completed}>
          {data.completed.length === 0 ? (
            <p className="text-subhead text-muted">{s.empty}</p>
          ) : (
            <ul className="flex flex-col gap-2">
              {data.completed.map((e) => (
                <EventLine key={e.id} event={e} />
              ))}
            </ul>
          )}
        </Panel>
        <Panel title={s.history}>
          {data.history.length === 0 ? (
            <p className="text-subhead text-muted">{s.empty}</p>
          ) : (
            <ol className="flex flex-col gap-2 border-l-2 border-separator pl-4">
              {data.history.map((e) => (
                <EventLine key={e.id} event={e} />
              ))}
            </ol>
          )}
        </Panel>
      </div>
    </div>
  );
}

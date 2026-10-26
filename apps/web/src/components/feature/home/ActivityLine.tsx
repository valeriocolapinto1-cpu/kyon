'use client';

import Link from 'next/link';
import { GitCommitHorizontal } from 'lucide-react';
import { Avatar } from '@/components/ui/Avatar';
import { InlineText } from '@/components/ui/InlineText';
import { taskHref, type ActivityItem } from '@/lib/client/home';
import { relativeTime } from '@/lib/format/relative';
import { it } from '@/lib/i18n/it';

const a = it.activity;

function verb(event: ActivityItem): string {
  const p = event.payload;
  if (event.type === 'commits_pushed')
    return a.pushed(Number(p.count ?? 1), String(p.branch ?? 'main'));
  return it.status.event[event.type] ?? event.type;
}

/** One line of history: who, what, on which task, where, when. Links to the task if it exists. */
export function ActivityLine({
  event,
  showProject = true,
  now,
}: {
  event: ActivityItem;
  showProject?: boolean;
  now?: Date;
}) {
  const p = event.payload;
  const text = typeof p.text === 'string' ? p.text : '';
  const taskId = typeof p.taskId === 'string' ? p.taskId : null;
  const who =
    event.actor?.name ??
    (event.type === 'commits_pushed'
      ? a.someoneOnGithub(typeof p.by === 'string' ? p.by : null)
      : it.tasks.history.github);
  const quoted = text && (
    <>
      {' '}
      «<InlineText text={text} />»
    </>
  );
  return (
    <li className="flex items-start gap-3">
      {event.actor ? (
        <Avatar name={event.actor.name} src={event.actor.avatarUrl} size="sm" />
      ) : (
        <span
          aria-hidden="true"
          className="flex size-8 shrink-0 items-center justify-center rounded-full bg-neutral-soft text-muted"
        >
          <GitCommitHorizontal className="size-4" />
        </span>
      )}
      <p className="min-w-0 flex-1 text-subhead text-fg">
        <span className="font-semibold">{who}</span> {verb(event)}
        {taskId && event.project ? (
          <Link
            href={taskHref(event.project.id, taskId)}
            className="text-accent-text underline decoration-1 underline-offset-2"
          >
            {quoted}
          </Link>
        ) : (
          quoted
        )}
        <span className="block text-footnote text-muted">
          {showProject && event.project ? `${event.project.name} · ` : ''}
          <time dateTime={event.createdAt}>{relativeTime(event.createdAt, now)}</time>
        </span>
      </p>
    </li>
  );
}

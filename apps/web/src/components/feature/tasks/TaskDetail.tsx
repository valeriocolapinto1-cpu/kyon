'use client';

import { useQueryClient } from '@tanstack/react-query';
import { ExternalLink, MapPin, Pencil, Plus } from 'lucide-react';
import { useState, type FormEvent } from 'react';
import { ACCENT_IDS, PRIORITIES, type Priority } from '@kyon/core';
import { GlassButton } from '@/components/ui/GlassButton';
import { GlassInput } from '@/components/ui/GlassInput';
import { GlassSelect } from '@/components/ui/GlassSelect';
import { GlassTextarea } from '@/components/ui/GlassTextarea';
import { useToast } from '@/components/ui/Toast';
import { ApiClientError, api } from '@/lib/client/api';
import type { ProjectDetail } from '@/lib/client/projects';
import {
  allTasks,
  tasksKey,
  useTaskHistory,
  type HistoryEvent,
  type TaskItem,
  type TasksData,
} from '@/lib/client/tasks';
import { cn } from '@/lib/cn';
import { formatDayLong } from '@/lib/format/day';
import { relativeTime } from '@/lib/format/relative';
import { it } from '@/lib/i18n/it';
import { InlineText, plainText } from '@/components/ui/InlineText';
import { LabelChip } from './TaskCard';
import type { TaskActions } from './useTaskActions';
import Link from 'next/link';
import { RunStateBadge } from '@/components/feature/prompts/RunState';
import { usePrompts } from '@/lib/client/prompts';

/** Prompts and runs of this task, with a shortcut to the Prompt tab. */
function TaskPrompts({
  projectId,
  task,
  canWrite,
}: {
  projectId: string;
  task: TaskItem;
  canWrite: boolean;
}) {
  const prompts = usePrompts(projectId);
  const mine = (prompts.data?.prompts ?? []).filter((x) => x.taskId === task.id);
  const runs = (prompts.data?.runs ?? []).filter((r) => r.taskId === task.id);
  const href = (extra: string) => `/progetti?id=${projectId}&tab=prompt${extra}`;
  return (
    <section aria-labelledby="detail-prompts" className="flex flex-col gap-2">
      <h3 id="detail-prompts" className="text-subhead font-medium text-fg">
        {d.prompts}
      </h3>
      {mine.length === 0 && <p className="text-footnote text-muted">{d.noPrompts}</p>}
      <ul className="flex flex-col gap-1">
        {mine.map((item) => {
          const run = runs.find((r) => r.promptId === item.id);
          return (
            <li key={item.id}>
              <Link
                href={href(`&prompt=${item.id}`)}
                className="flex min-h-touch flex-wrap items-center gap-2 rounded-control px-2 hover:bg-neutral-soft"
              >
                <span className="text-body text-accent-text">{item.title}</span>
                <span className="text-caption text-muted">{it.prompts.status[item.status]}</span>
                {run && <RunStateBadge state={run.state} prNumber={run.prNumber} />}
              </Link>
            </li>
          );
        })}
      </ul>
      {canWrite && (
        <Link
          href={href(`&new=1&task=${task.id}`)}
          className="inline-flex min-h-touch items-center self-start font-semibold text-accent-text"
        >
          {d.writePrompt}
        </Link>
      )}
    </section>
  );
}

const t = it.tasks;
const d = t.detail;

function describe(event: HistoryEvent, columns: TasksData['columns']): string {
  const p = event.payload;
  switch (event.type) {
    case 'task_moved':
      return t.history.task_moved(
        String(p.toName ?? columns.find((c) => c.id === p.to)?.name ?? '?'),
      );
    case 'task_assigned':
      return t.history.task_assigned((p.toName as string | null) ?? null);
    case 'task_priority':
      return t.history.task_priority(it.priority[p.to as Priority] ?? String(p.to));
    case 'task_due':
      return t.history.task_due(p.to ? formatDayLong(String(p.to)) : null);
    case 'task_completed':
    case 'task_reopened':
    case 'task_renamed':
    case 'task_added':
      return t.history[event.type];
    default:
      return event.type;
  }
}

function labelColor(name: string) {
  let h = 0;
  for (const ch of name) h = (h * 31 + ch.charCodeAt(0)) >>> 0;
  return ACCENT_IDS[h % ACCENT_IDS.length] ?? 'blue';
}

export function TaskDetail({
  projectId,
  data,
  task,
  project,
  canEdit,
  actions,
  onOpenTask,
}: {
  projectId: string;
  data: TasksData;
  task: TaskItem;
  project: ProjectDetail;
  canEdit: boolean;
  actions: TaskActions;
  onOpenTask: (task: TaskItem) => void;
}) {
  const queryClient = useQueryClient();
  const { toast } = useToast();
  const history = useTaskHistory(projectId, task.id);
  const [renaming, setRenaming] = useState(false);
  const [notes, setNotes] = useState(task.notesKyon ?? '');
  const [notesFor, setNotesFor] = useState(task.id);
  const [newLabel, setNewLabel] = useState('');
  // A different task opened in the same panel: reset the local drafts (no effect needed).
  if (notesFor !== task.id) {
    setNotesFor(task.id);
    setNotes(task.notesKyon ?? '');
    setRenaming(false);
  }

  const subtasks = allTasks(data).filter(
    (x) => x.path === task.path && x.parentId === task.stableId,
  );
  const columns = [...data.columns].sort((a, b) => a.position - b.position);
  const where = [task.path, ...task.headingPath].join(' › ');
  const fileUrl = project.repo
    ? `${project.repo.htmlUrl}/blob/${encodeURIComponent(project.repo.defaultBranch)}/${task.path
        .split('/')
        .map(encodeURIComponent)
        .join('/')}#L${task.line + 1}`
    : null;

  const rename = async (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    const text = String(new FormData(event.currentTarget).get('text') ?? '').trim();
    if (!text || text === task.text) return setRenaming(false);
    if (await actions.patch(task.id, { text })) setRenaming(false);
  };

  const toggleLabel = (labelId: string) => {
    const ids = task.labels.map((l) => l.id);
    void actions.patch(task.id, {
      labelIds: ids.includes(labelId) ? ids.filter((x) => x !== labelId) : [...ids, labelId],
    });
  };

  const addLabel = async (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    const name = newLabel.trim();
    if (!name) return;
    try {
      const { id } = await api<{ id: string }>(`/api/projects/${projectId}/labels`, {
        method: 'POST',
        json: { name, color: labelColor(name) },
      });
      await queryClient.invalidateQueries({ queryKey: tasksKey(projectId) });
      setNewLabel('');
      if (!task.labels.some((l) => l.id === id))
        void actions.patch(task.id, { labelIds: [...task.labels.map((l) => l.id), id] });
    } catch (error) {
      toast({
        tone: 'error',
        title: error instanceof ApiClientError ? error.message : it.common.errorBody,
      });
    }
  };

  const saveNotes = async () => {
    const value = notes.trim() || null;
    if (value === (task.notesKyon ?? null)) return;
    if (await actions.patch(task.id, { notes: value }))
      toast({ tone: 'success', title: d.notesSaved });
  };

  return (
    <div className="flex flex-col gap-5">
      <div className="flex items-start gap-2">
        <label className="flex size-touch shrink-0 cursor-pointer items-center justify-center">
          <span className="sr-only">{d.done}</span>
          <input
            type="checkbox"
            checked={task.done}
            disabled={!canEdit}
            onChange={() =>
              void actions.patch(
                task.id,
                { done: !task.done },
                {
                  undo: {
                    label: task.done ? t.reopenedToast : t.completedToast,
                    patch: { done: task.done },
                  },
                },
              )
            }
            className="size-6 accent-[var(--k-accent-fill)]"
          />
        </label>
        {renaming ? (
          <form onSubmit={rename} className="flex min-w-0 flex-1 flex-col gap-2">
            <GlassInput
              label={d.text}
              name="text"
              defaultValue={task.text}
              maxLength={500}
              required
              autoFocus
              hint={d.renameHelp}
            />
            <div className="flex gap-2">
              <GlassButton type="submit" variant="primary" size="sm">
                {d.save}
              </GlassButton>
              <GlassButton size="sm" variant="plain" onClick={() => setRenaming(false)}>
                {d.cancel}
              </GlassButton>
            </div>
          </form>
        ) : (
          <div className="flex min-w-0 flex-1 items-start gap-1">
            <p
              className={cn(
                'min-w-0 flex-1 pt-2.5 text-title3 font-semibold text-fg [overflow-wrap:anywhere]',
                task.done && 'text-muted line-through',
              )}
            >
              <InlineText text={task.text} links />
            </p>
            {canEdit && (
              <GlassButton
                size="icon"
                variant="plain"
                aria-label={d.rename}
                onClick={() => setRenaming(true)}
              >
                <Pencil className="size-5" aria-hidden="true" />
              </GlassButton>
            )}
          </div>
        )}
      </div>

      <div className="flex flex-col gap-1">
        <h3 className="text-footnote font-semibold text-muted">{d.where}</h3>
        <p className="flex items-start gap-1.5 text-subhead text-fg [overflow-wrap:anywhere]">
          <MapPin className="mt-0.5 size-4 shrink-0 text-muted" aria-hidden="true" />
          {where}
        </p>
        {fileUrl && (
          <a
            href={fileUrl}
            target="_blank"
            rel="noreferrer"
            className="inline-flex min-h-touch items-center gap-1 self-start text-subhead font-semibold text-accent-text"
          >
            {d.openOnGitHub} <ExternalLink className="size-4" aria-hidden="true" />
            <span className="sr-only">(si apre in una nuova scheda)</span>
          </a>
        )}
      </div>

      <div className="grid gap-4 sm:grid-cols-2">
        <GlassSelect
          label={d.column}
          value={task.columnId ?? ''}
          disabled={!canEdit}
          onChange={(event) => {
            const column = data.columns.find((c) => c.id === event.target.value);
            if (column) actions.move(task.id, { columnId: column.id, index: 0 });
          }}
          options={columns.map((c) => ({ value: c.id, label: c.name }))}
        />
        <GlassSelect
          label={d.assignee}
          value={task.assignee?.id ?? ''}
          disabled={!canEdit}
          onChange={(event) => {
            const member = project.members.find((m) => m.id === event.target.value);
            void actions.patch(
              task.id,
              { assigneeId: member?.id ?? null },
              {
                assignee: member
                  ? { id: member.id, name: member.name, avatarUrl: member.avatarUrl }
                  : null,
              },
            );
          }}
          options={[
            { value: '', label: d.nobody },
            ...project.members
              .filter((m) => m.role !== 'viewer' || m.id === task.assignee?.id)
              .map((m) => ({ value: m.id, label: m.name })),
          ]}
        />
        <GlassSelect
          label={d.priority}
          value={task.priority}
          disabled={!canEdit}
          onChange={(event) =>
            void actions.patch(task.id, { priority: event.target.value as Priority })
          }
          options={PRIORITIES.map((p) => ({ value: p, label: it.priority[p] }))}
        />
        <div className="flex flex-col gap-1">
          <GlassInput
            // Remount when the date changes elsewhere (calendar, live update).
            key={`${task.id}-${task.dueDate ?? ''}`}
            label={d.due}
            type="date"
            defaultValue={task.dueDate ?? ''}
            disabled={!canEdit}
            // Committed on blur: typing a date segment by segment must not save each step.
            onBlur={(event) => {
              const value = event.target.value || null;
              if (value !== task.dueDate) void actions.patch(task.id, { dueDate: value });
            }}
          />
          {canEdit && task.dueDate && (
            <GlassButton
              size="sm"
              variant="plain"
              className="self-start"
              onClick={() => void actions.patch(task.id, { dueDate: null })}
            >
              {d.clearDue}
            </GlassButton>
          )}
        </div>
      </div>

      <fieldset className="flex flex-col gap-2">
        <legend className="mb-2 text-subhead font-medium text-fg">{d.labels}</legend>
        <div className="flex flex-wrap gap-2">
          {data.labels.map((label) => {
            const on = task.labels.some((l) => l.id === label.id);
            return (
              <button
                key={label.id}
                type="button"
                aria-pressed={on}
                disabled={!canEdit}
                onClick={() => toggleLabel(label.id)}
                className={cn(
                  'inline-flex min-h-touch items-center rounded-pill px-1 focus-visible:ring-2 focus-visible:ring-focus',
                  on ? 'ring-2 ring-accent' : 'opacity-70',
                )}
              >
                <LabelChip label={label} />
              </button>
            );
          })}
        </div>
        {canEdit && (
          <form onSubmit={addLabel} className="flex items-end gap-2">
            <GlassInput
              label={d.newLabel}
              value={newLabel}
              onChange={(event) => setNewLabel(event.target.value)}
              maxLength={30}
              className="flex-1"
            />
            <GlassButton type="submit" size="icon" aria-label={d.addLabel}>
              <Plus className="size-5" aria-hidden="true" />
            </GlassButton>
          </form>
        )}
      </fieldset>

      <GlassTextarea
        label={d.notes}
        hint={d.notesHelp}
        value={notes}
        readOnly={!canEdit}
        maxLength={5000}
        onChange={(event) => setNotes(event.target.value)}
        onBlur={() => void saveNotes()}
      />

      {task.notes.length > 0 && (
        <section aria-labelledby="detail-repo-notes" className="flex flex-col gap-1">
          <h3 id="detail-repo-notes" className="text-subhead font-medium text-fg">
            {d.repoNotes}
          </h3>
          <ul className="flex list-disc flex-col gap-1 pl-5 text-subhead text-fg">
            {task.notes.map((note, i) => (
              <li key={i}>
                <InlineText text={note} links />
              </li>
            ))}
          </ul>
        </section>
      )}

      {subtasks.length > 0 && (
        <section aria-labelledby="detail-subtasks" className="flex flex-col gap-1">
          <h3 id="detail-subtasks" className="text-subhead font-medium text-fg">
            {d.subtasks} ({subtasks.filter((s) => s.done).length}/{subtasks.length})
          </h3>
          <ul className="flex flex-col">
            {subtasks.map((sub) => (
              <li key={sub.id} className="flex items-center gap-1">
                <label className="flex size-touch shrink-0 cursor-pointer items-center justify-center">
                  <span className="sr-only">{`${d.done}: ${plainText(sub.text)}`}</span>
                  <input
                    type="checkbox"
                    checked={sub.done}
                    disabled={!canEdit}
                    onChange={() => void actions.patch(sub.id, { done: !sub.done })}
                    className="size-5 accent-[var(--k-accent-fill)]"
                  />
                </label>
                <button
                  type="button"
                  onClick={() => onOpenTask(sub)}
                  className={cn(
                    'min-h-touch flex-1 rounded-control px-2 text-left text-body text-fg hover:bg-neutral-soft',
                    sub.done && 'text-muted line-through',
                  )}
                >
                  <InlineText text={sub.text} />
                </button>
              </li>
            ))}
          </ul>
        </section>
      )}

      <section aria-labelledby="detail-history" className="flex flex-col gap-2">
        <h3 id="detail-history" className="text-subhead font-medium text-fg">
          {d.history}
        </h3>
        <ol className="flex flex-col gap-2 border-l-2 border-separator pl-4">
          {(history.data?.events ?? []).map((event) => (
            <li key={event.id} className="text-footnote text-fg">
              <span className="font-semibold">{event.actor?.name ?? t.history.github}</span>{' '}
              {describe(event, data.columns)}
              <span className="text-muted">
                {' · '}
                <time dateTime={event.createdAt}>{relativeTime(event.createdAt)}</time>
              </span>
            </li>
          ))}
          {history.data && (
            <li className="text-footnote text-muted">
              {d.created} ·{' '}
              <time dateTime={history.data.createdAt}>{relativeTime(history.data.createdAt)}</time>
            </li>
          )}
        </ol>
      </section>

      <TaskPrompts projectId={projectId} task={task} canWrite={canEdit} />

      <p className="text-footnote text-muted">{d.commentsLater}</p>
    </div>
  );
}

'use client';

import {
  AlertTriangle,
  CalendarDays,
  CheckCircle2,
  ListChecks,
  MessageCircle,
  MoreHorizontal,
} from 'lucide-react';
import type { KeyboardEvent, PointerEvent, Ref } from 'react';
import { ACCENTS, type AccentId } from '@kyon/core';
import { Avatar } from '@/components/ui/Avatar';
import { Menu, type MenuEntry } from '@/components/ui/Menu';
import { PriorityBadge } from '@/components/ui/PriorityBadge';
import { RunStateBadge } from '@/components/feature/prompts/RunState';
import type { TaskItem } from '@/lib/client/tasks';
import { cn } from '@/lib/cn';
import { formatDayShort } from '@/lib/format/day';
import { it } from '@/lib/i18n/it';
import { InlineText, plainText } from '@/components/ui/InlineText';

const c = it.tasks.card;

export function LabelChip({ label }: { label: { name: string; color: string } }) {
  const color = ACCENTS[label.color as AccentId]?.light ?? ACCENTS.blue.light;
  return (
    <span className="inline-flex items-center gap-1 rounded-pill bg-neutral-soft px-2 py-0.5 text-caption font-semibold text-fg">
      <span aria-hidden="true" className="size-2 rounded-full" style={{ background: color }} />
      {label.name}
    </span>
  );
}

export function DueChip({ day, today, done }: { day: string; today: string; done: boolean }) {
  const overdue = !done && day < today;
  const label = formatDayShort(day);
  return (
    <span
      className={cn(
        'inline-flex items-center gap-1 rounded-pill px-2 py-0.5 text-caption font-semibold',
        overdue ? 'bg-accent-soft text-danger' : 'bg-neutral-soft text-fg',
      )}
    >
      {overdue ? (
        <AlertTriangle className="size-3.5" aria-hidden="true" />
      ) : (
        <CalendarDays className="size-3.5" aria-hidden="true" />
      )}
      <span className="sr-only">{overdue ? c.overdue(label) : c.due(label)}</span>
      <span aria-hidden="true">{label}</span>
    </span>
  );
}

export interface TaskCardProps {
  task: TaskItem;
  subtasks: { done: number; total: number };
  today: string;
  tabIndex: number;
  canEdit: boolean;
  menu: MenuEntry[];
  menuOpen: boolean;
  onMenuOpenChange: (open: boolean) => void;
  onOpen: () => void;
  onKeyDown: (event: KeyboardEvent<HTMLButtonElement>) => void;
  onFocus: () => void;
  onPointerDown?: (event: PointerEvent<HTMLElement>) => void;
  buttonRef?: Ref<HTMLButtonElement>;
  selected?: boolean;
  compact?: boolean;
}

/**
 * A kanban card: one big button (opens the detail, carries the keyboard shortcuts and the drag)
 * plus an actions menu. Solid surface, no blur: dozens of cards must stay cheap to render.
 */
export function TaskCard({
  task,
  subtasks,
  today,
  tabIndex,
  canEdit,
  menu,
  menuOpen,
  onMenuOpenChange,
  onOpen,
  onKeyDown,
  onFocus,
  onPointerDown,
  buttonRef,
  selected,
  compact,
}: TaskCardProps) {
  const title = plainText(task.text);
  return (
    <div
      data-drag-source
      data-card-id={task.id}
      className={cn(
        'group relative rounded-control border border-border bg-surface-solid shadow-[var(--k-shadow-1)]',
        'transition-[opacity,box-shadow] data-[dragging]:opacity-40',
        selected && 'ring-2 ring-focus',
      )}
    >
      <button
        ref={buttonRef}
        type="button"
        tabIndex={tabIndex}
        data-task-button={task.id}
        onClick={onOpen}
        onKeyDown={onKeyDown}
        onFocus={onFocus}
        onPointerDown={onPointerDown}
        aria-keyshortcuts="Enter X M A 1 2 3 4 0 Alt+ArrowLeft Alt+ArrowRight Alt+ArrowUp Alt+ArrowDown"
        className={cn(
          'flex w-full flex-col gap-2 rounded-control p-3 pr-12 text-left outline-none select-none',
          'focus-visible:ring-2 focus-visible:ring-focus [-webkit-touch-callout:none]',
          'min-h-touch',
          canEdit && 'touch-manipulation',
        )}
      >
        <span className="flex items-start gap-2">
          {task.done && (
            <CheckCircle2 className="mt-0.5 size-4 shrink-0 text-success" aria-label={c.done} />
          )}
          <span
            className={cn(
              'line-clamp-3 text-subhead font-medium text-fg',
              task.done && 'text-muted line-through decoration-1',
            )}
          >
            <InlineText text={task.text} />
          </span>
        </span>
        {!compact &&
          (task.priority !== 'none' ||
            task.dueDate ||
            task.labels.length > 0 ||
            subtasks.total > 0 ||
            task.run ||
            task.comments > 0 ||
            task.assignee) && (
            <span className="flex flex-wrap items-center gap-1.5">
              {task.priority !== 'none' && <PriorityBadge priority={task.priority} />}
              {task.dueDate && <DueChip day={task.dueDate} today={today} done={task.done} />}
              {task.labels.map((label) => (
                <LabelChip key={label.id} label={label} />
              ))}
              {subtasks.total > 0 && (
                <span className="inline-flex items-center gap-1 text-caption font-semibold text-muted">
                  <ListChecks className="size-3.5" aria-hidden="true" />
                  <span className="sr-only">{c.subtasks(subtasks.done, subtasks.total)}</span>
                  <span aria-hidden="true">
                    {subtasks.done}/{subtasks.total}
                  </span>
                </span>
              )}
              {task.comments > 0 && (
                <span className="inline-flex items-center gap-1 text-caption font-semibold text-muted">
                  <MessageCircle className="size-3.5" aria-hidden="true" />
                  <span className="sr-only">{c.comments(task.comments)}</span>
                  <span aria-hidden="true">{task.comments}</span>
                </span>
              )}
              {task.run && task.run.state !== 'abandoned' && (
                <RunStateBadge state={task.run.state} prNumber={task.run.prNumber} compact />
              )}
              {task.assignee && (
                <span className="ml-auto">
                  <Avatar
                    name={c.assignee(task.assignee.name)}
                    src={task.assignee.avatarUrl}
                    size="sm"
                  />
                </span>
              )}
            </span>
          )}
      </button>
      {canEdit && menu.length > 0 && (
        <div className="absolute top-1 right-1">
          <Menu
            open={menuOpen}
            onOpenChange={onMenuOpenChange}
            label={`${c.actions}: ${title}`}
            entries={menu}
            trigger={
              <button
                type="button"
                tabIndex={tabIndex}
                aria-label={`${c.actions}: ${title}`}
                className="k-pressable inline-flex size-touch items-center justify-center rounded-full text-muted hover:bg-neutral-soft focus-visible:ring-2 focus-visible:ring-focus"
              >
                <MoreHorizontal className="size-5" aria-hidden="true" />
              </button>
            }
          />
        </div>
      )}
    </div>
  );
}

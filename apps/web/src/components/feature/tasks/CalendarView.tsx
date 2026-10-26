'use client';

import { ChevronLeft, ChevronRight } from 'lucide-react';
import { useMemo, useState, type KeyboardEvent } from 'react';
import { addDays, addMonths, monthGrid, weekDays, type Day } from '@kyon/core';
import { GlassButton } from '@/components/ui/GlassButton';
import { Segmented } from '@/components/ui/Segmented';
import type { TaskItem } from '@/lib/client/tasks';
import { cn } from '@/lib/cn';
import { formatDayLong, formatDayShort, formatMonth } from '@/lib/format/day';
import { it } from '@/lib/i18n/it';
import { InlineText } from '@/components/ui/InlineText';
import { usePointerDrag } from './usePointerDrag';

const t = it.tasks;
const k = t.calendar;
type Mode = 'month' | 'week' | 'agenda';

function Chip({
  task,
  today,
  canEdit,
  selected,
  onOpen,
  onKeyDown,
  onPointerDown,
}: {
  task: TaskItem;
  today: Day;
  canEdit: boolean;
  selected: boolean;
  onOpen: () => void;
  onKeyDown: (event: KeyboardEvent<HTMLButtonElement>) => void;
  onPointerDown: ReturnType<ReturnType<typeof usePointerDrag>['handle']>;
}) {
  const overdue = !task.done && task.dueDate !== null && task.dueDate < today;
  return (
    <div data-drag-source data-card-id={task.id} className="data-[dragging]:opacity-40">
      <button
        type="button"
        data-task-button={task.id}
        onClick={onOpen}
        onKeyDown={onKeyDown}
        onPointerDown={onPointerDown}
        aria-keyshortcuts={
          canEdit ? 'Alt+ArrowLeft Alt+ArrowRight Alt+ArrowUp Alt+ArrowDown' : undefined
        }
        className={cn(
          'flex min-h-touch w-full items-center gap-2 rounded-control border border-border bg-surface-solid px-2.5 text-left text-footnote text-fg select-none [-webkit-touch-callout:none]',
          'focus-visible:ring-2 focus-visible:ring-focus',
          task.done && 'text-muted line-through',
          overdue && 'border-l-4 border-l-[var(--k-danger-fill)]',
          selected && 'ring-2 ring-focus',
        )}
      >
        <span className="line-clamp-2">
          <InlineText text={task.text} />
        </span>
        {overdue && (
          <span className="sr-only">, {t.card.overdue(formatDayShort(task.dueDate ?? today))}</span>
        )}
      </button>
    </div>
  );
}

export function CalendarView({
  tasks,
  canEdit,
  today,
  selectedId,
  reducedMotion,
  onOpen,
  onSetDue,
}: {
  /** Visible top-level and sub tasks (filters applied). */
  tasks: TaskItem[];
  canEdit: boolean;
  today: Day;
  selectedId: string | null;
  reducedMotion: boolean;
  onOpen: (task: TaskItem) => void;
  onSetDue: (task: TaskItem, day: Day | null, announce: string) => void;
}) {
  const [mode, setMode] = useState<Mode>('month');
  const [anchor, setAnchor] = useState<Day>(today);

  const byDay = useMemo(() => {
    const map = new Map<Day, TaskItem[]>();
    for (const task of tasks) {
      if (!task.dueDate) continue;
      map.set(task.dueDate, [...(map.get(task.dueDate) ?? []), task]);
    }
    return map;
  }, [tasks]);
  const undated = tasks.filter((x) => !x.dueDate && !x.done);

  const setDue = (task: TaskItem, day: Day | null) =>
    onSetDue(task, day, day ? k.dueSet(formatDayLong(day)) : t.history.task_due(null));

  const { drag, handle } = usePointerDrag<{ day: Day }>({
    enabled: canEdit,
    reducedMotion,
    resolveTarget: (x, y) => {
      const day = document.elementFromPoint(x, y)?.closest<HTMLElement>('[data-drop-day]')
        ?.dataset.dropDay;
      return day ? { day } : null;
    },
    onDrop: (id, target) => {
      const task = tasks.find((x) => x.id === id);
      if (task && task.dueDate !== target.day) setDue(task, target.day);
    },
  });

  const chipKeys = (task: TaskItem) => (event: KeyboardEvent<HTMLButtonElement>) => {
    if (!canEdit || !event.altKey) return;
    const step = { ArrowLeft: -1, ArrowRight: 1, ArrowUp: -7, ArrowDown: 7 }[event.key];
    if (step === undefined) return;
    event.preventDefault();
    const next = task.dueDate ? addDays(task.dueDate, step) : anchor;
    setAnchor(next);
    setDue(task, next);
    // The chip moves to another day cell: keep the keyboard on it.
    requestAnimationFrame(() =>
      document.querySelector<HTMLElement>(`[data-task-button="${task.id}"]`)?.focus(),
    );
  };

  const chip = (task: TaskItem) => (
    <Chip
      key={task.id}
      task={task}
      today={today}
      canEdit={canEdit}
      selected={selectedId === task.id}
      onOpen={() => onOpen(task)}
      onKeyDown={chipKeys(task)}
      onPointerDown={handle(task.id)}
    />
  );

  const step = (direction: 1 | -1) =>
    setAnchor(mode === 'month' ? addMonths(anchor, direction) : addDays(anchor, 7 * direction));
  const title =
    mode === 'month'
      ? formatMonth(anchor)
      : mode === 'week'
        ? `${formatDayShort(weekDays(anchor)[0] ?? anchor)} – ${formatDayShort(weekDays(anchor)[6] ?? anchor)}`
        : k.agenda;

  const dayCell = (day: Day, inMonth: boolean) => {
    const list = byDay.get(day) ?? [];
    const isToday = day === today;
    const isSelected = day === anchor;
    const hovering = drag?.target?.day === day;
    return (
      <div
        key={day}
        role="cell"
        data-drop-day={day}
        className={cn(
          'flex min-h-16 min-w-0 flex-col gap-1 rounded-control p-1 lg:min-h-28',
          !inMonth && 'opacity-60',
          isSelected && 'bg-accent-soft',
          hovering && 'ring-2 ring-focus',
        )}
      >
        <button
          type="button"
          onClick={() => setAnchor(day)}
          aria-label={k.dayLabel(formatDayLong(day), list.length)}
          aria-current={isToday ? 'date' : undefined}
          aria-pressed={isSelected}
          className={cn(
            'flex min-h-touch w-full flex-col items-center justify-center rounded-control text-subhead hover:bg-neutral-soft focus-visible:ring-2 focus-visible:ring-focus lg:items-start lg:px-2',
            isToday ? 'font-bold text-accent-text' : 'text-fg',
          )}
        >
          <span aria-hidden="true">{Number(day.slice(8))}</span>
          {list.length > 0 && (
            <span aria-hidden="true" className="flex gap-0.5 lg:hidden">
              {list.slice(0, 3).map((x) => (
                <span key={x.id} className="size-1.5 rounded-full bg-accent-fill" />
              ))}
            </span>
          )}
        </button>
        <div className="hidden flex-col gap-1 lg:flex">
          {list.slice(0, 3).map(chip)}
          {list.length > 3 && (
            <span className="px-2 text-caption text-muted">{k.more(list.length - 3)}</span>
          )}
        </div>
      </div>
    );
  };

  const agendaDays = [...byDay.keys()].sort();

  return (
    <div className="flex flex-col gap-4">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <Segmented<Mode>
          label={k.modeLabel}
          value={mode}
          onChange={setMode}
          options={[
            { value: 'month', label: k.month },
            { value: 'week', label: k.week },
            { value: 'agenda', label: k.agenda },
          ]}
        />
        {mode !== 'agenda' && (
          <div className="flex items-center gap-1">
            <GlassButton
              size="icon"
              variant="plain"
              aria-label={k.previous}
              onClick={() => step(-1)}
            >
              <ChevronLeft className="size-5" aria-hidden="true" />
            </GlassButton>
            <GlassButton size="sm" variant="plain" onClick={() => setAnchor(today)}>
              {k.today}
            </GlassButton>
            <GlassButton size="icon" variant="plain" aria-label={k.next} onClick={() => step(1)}>
              <ChevronRight className="size-5" aria-hidden="true" />
            </GlassButton>
          </div>
        )}
      </div>
      <h3 className="text-title3 font-semibold text-fg first-letter:uppercase" aria-live="polite">
        {title}
      </h3>

      {mode === 'month' && (
        <div className="k-glass rounded-card p-2">
          <div role="table" aria-label={title} className="flex flex-col gap-1">
            <div role="row" className="grid grid-cols-7 gap-1">
              {k.weekdays.map((d) => (
                <span
                  key={d}
                  role="columnheader"
                  className="text-center text-caption font-semibold text-muted"
                >
                  {d}
                </span>
              ))}
            </div>
            {monthGrid(anchor).map((week) => (
              <div key={week[0]} role="row" className="grid grid-cols-7 gap-1">
                {week.map((day) => dayCell(day, day.slice(0, 7) === anchor.slice(0, 7)))}
              </div>
            ))}
          </div>
        </div>
      )}

      {mode === 'month' && (
        <section aria-labelledby="calendar-day" className="flex flex-col gap-2 lg:hidden">
          <h4 id="calendar-day" className="text-headline text-fg first-letter:uppercase">
            {formatDayLong(anchor)}
          </h4>
          <div data-drop-day={anchor} className="flex flex-col gap-2">
            {(byDay.get(anchor) ?? []).map(chip)}
            {!(byDay.get(anchor) ?? []).length && (
              <p className="text-footnote text-muted">{k.agendaEmpty}</p>
            )}
          </div>
        </section>
      )}

      {mode === 'week' && (
        <ol className="grid gap-2 md:grid-cols-7">
          {weekDays(anchor).map((day) => (
            <li
              key={day}
              data-drop-day={day}
              aria-labelledby={`week-${day}`}
              className={cn(
                'k-glass flex min-h-24 flex-col gap-2 rounded-card p-2',
                drag?.target?.day === day && 'ring-2 ring-focus',
              )}
            >
              <h4
                id={`week-${day}`}
                className={cn(
                  'px-1 text-footnote font-semibold first-letter:uppercase',
                  day === today ? 'text-accent-text' : 'text-muted',
                )}
              >
                {formatDayLong(day).replace(/ \d{4}$/, '')}
              </h4>
              {(byDay.get(day) ?? []).map(chip)}
            </li>
          ))}
        </ol>
      )}

      {mode === 'agenda' && (
        <div className="flex flex-col gap-3">
          {agendaDays.length === 0 && <p className="text-body text-muted">{k.agendaEmpty}</p>}
          {agendaDays.map((day) => (
            <section
              key={day}
              aria-labelledby={`agenda-${day}`}
              data-drop-day={day}
              className="k-glass flex flex-col gap-2 rounded-card p-3"
            >
              <h4
                id={`agenda-${day}`}
                className={cn(
                  'text-subhead font-semibold first-letter:uppercase',
                  day < today ? 'text-danger' : day === today ? 'text-accent-text' : 'text-fg',
                )}
              >
                {formatDayLong(day)}
              </h4>
              {(byDay.get(day) ?? []).map(chip)}
            </section>
          ))}
        </div>
      )}

      {undated.length > 0 && (
        <section aria-labelledby="calendar-undated" className="flex flex-col gap-2">
          <h4 id="calendar-undated" className="text-headline text-fg">
            {k.noDue} ({undated.length})
          </h4>
          {canEdit && <p className="text-footnote text-muted">{k.noDueHelp}</p>}
          <div className="grid gap-2 sm:grid-cols-2 lg:grid-cols-3">{undated.map(chip)}</div>
        </section>
      )}
    </div>
  );
}

'use client';

import { useEffect, useMemo, useRef, useState, type KeyboardEvent } from 'react';
import type { MenuEntry } from '@/components/ui/Menu';
import { columnTasks, type ColumnItem, type TaskItem, type TasksData } from '@/lib/client/tasks';
import { cn } from '@/lib/cn';
import { it } from '@/lib/i18n/it';
import { TaskCard } from './TaskCard';
import { usePointerDrag } from './usePointerDrag';

const t = it.tasks;

interface Target {
  columnId: string;
  index: number;
}

export interface BoardProps {
  data: TasksData;
  /** Visible (filtered) top-level tasks. */
  tasks: TaskItem[];
  subtasks: (task: TaskItem) => { done: number; total: number };
  canEdit: boolean;
  today: string;
  selectedId: string | null;
  reducedMotion: boolean;
  onOpen: (task: TaskItem) => void;
  menuFor: (task: TaskItem) => MenuEntry[];
  /** Single-key shortcuts (x, a, 1–4, 0…). Returns true when handled. */
  onShortcut: (task: TaskItem, event: KeyboardEvent) => boolean;
  onMove: (task: TaskItem, to: Target, announce: string) => void;
}

/** Index inside the whole column (hidden tasks included) for a drop among the visible cards. */
function fullIndex(
  data: TasksData,
  visible: TaskItem[],
  columnId: string,
  visibleIndex: number,
  movingId: string,
) {
  const full = columnTasks(data, columnId).filter((x) => x.id !== movingId);
  const shown = visible.filter((x) => x.id !== movingId);
  const before = shown[visibleIndex];
  if (before) return full.findIndex((x) => x.id === before.id);
  const last = shown.at(-1);
  return last ? full.findIndex((x) => x.id === last.id) + 1 : full.length;
}

export function KanbanBoard({
  data,
  tasks,
  subtasks,
  canEdit,
  today,
  selectedId,
  reducedMotion,
  onOpen,
  menuFor,
  onShortcut,
  onMove,
}: BoardProps) {
  const columns = useMemo(
    () => [...data.columns].sort((a, b) => a.position - b.position),
    [data.columns],
  );
  const byColumn = useMemo(() => {
    const fallback = columns.find((c) => !c.isDone && !c.isInProgress) ?? columns[0];
    const map = new Map<string, TaskItem[]>(columns.map((c) => [c.id, []]));
    for (const task of tasks) {
      const key = task.columnId && map.has(task.columnId) ? task.columnId : fallback?.id;
      if (key) map.get(key)?.push(task);
    }
    for (const list of map.values()) list.sort((a, b) => a.position - b.position);
    return map;
  }, [columns, tasks]);

  const [focusId, setFocusId] = useState<string | null>(null);
  const [menuOpenId, setMenuOpenId] = useState<string | null>(null);
  const buttons = useRef(new Map<string, HTMLButtonElement>());
  const refocus = useRef<string | null>(null);
  useEffect(() => {
    if (!refocus.current) return;
    buttons.current.get(refocus.current)?.focus();
    refocus.current = null;
  });

  const activeId = tasks.some((x) => x.id === focusId) ? focusId : (tasks[0]?.id ?? null);

  const move = (task: TaskItem, column: ColumnItem, visibleIndex: number) => {
    const visible = byColumn.get(column.id) ?? [];
    const total = visible.filter((x) => x.id !== task.id).length + 1;
    const position = Math.min(visibleIndex, total - 1) + 1;
    refocus.current = task.id;
    onMove(
      task,
      { columnId: column.id, index: fullIndex(data, visible, column.id, visibleIndex, task.id) },
      t.moved(column.name, position, total),
    );
  };

  const { drag, handle } = usePointerDrag<Target>({
    enabled: canEdit,
    reducedMotion,
    resolveTarget: (x, y, id) => {
      const column = document.elementFromPoint(x, y)?.closest<HTMLElement>('[data-drop-column]');
      const columnId = column?.dataset.dropColumn;
      if (!column || !columnId) return null;
      const cards = [...column.querySelectorAll<HTMLElement>('[data-card-id]')].filter(
        (el) => el.dataset.cardId !== id && !('dragGhost' in el.dataset),
      );
      const index = cards.findIndex((el) => {
        const r = el.getBoundingClientRect();
        return y < r.top + r.height / 2;
      });
      return { columnId, index: index < 0 ? cards.length : index };
    },
    onDrop: (id, target) => {
      const task = tasks.find((x) => x.id === id);
      const column = columns.find((c) => c.id === target.columnId);
      if (task && column) move(task, column, target.index);
    },
  });

  const onKeyDown = (task: TaskItem, col: number, row: number) => (event: KeyboardEvent) => {
    const column = columns[col];
    if (!column) return;
    const list = byColumn.get(column.id) ?? [];
    const focus = (id: string | undefined) => {
      if (!id) return;
      setFocusId(id);
      buttons.current.get(id)?.focus();
    };
    const neighbour = (step: number, skipEmpty: boolean) => {
      for (let i = col + step; i >= 0 && i < columns.length; i += step) {
        const c = columns[i];
        if (c && (!skipEmpty || (byColumn.get(c.id)?.length ?? 0) > 0)) return c;
        if (!skipEmpty) break;
      }
      return null;
    };
    if (event.altKey && canEdit && event.key.startsWith('Arrow')) {
      event.preventDefault();
      if (event.key === 'ArrowUp' && row > 0) move(task, column, row - 1);
      if (event.key === 'ArrowDown' && row < list.length - 1) move(task, column, row + 1);
      if (event.key === 'ArrowLeft' || event.key === 'ArrowRight') {
        const target = neighbour(event.key === 'ArrowLeft' ? -1 : 1, false);
        if (target) move(task, target, Math.min(row, byColumn.get(target.id)?.length ?? 0));
      }
      return;
    }
    switch (event.key) {
      case 'ArrowDown':
        event.preventDefault();
        focus(list[row + 1]?.id);
        return;
      case 'ArrowUp':
        event.preventDefault();
        focus(list[row - 1]?.id);
        return;
      case 'Home':
        event.preventDefault();
        focus(list[0]?.id);
        return;
      case 'End':
        event.preventDefault();
        focus(list.at(-1)?.id);
        return;
      case 'ArrowLeft':
      case 'ArrowRight': {
        event.preventDefault();
        const target = neighbour(event.key === 'ArrowLeft' ? -1 : 1, true);
        const targetList = target ? (byColumn.get(target.id) ?? []) : [];
        focus(targetList[Math.min(row, targetList.length - 1)]?.id);
        return;
      }
    }
    if (canEdit && (event.key === 'm' || event.key === 'M') && !event.metaKey && !event.ctrlKey) {
      event.preventDefault();
      setMenuOpenId(task.id);
      return;
    }
    if (onShortcut(task, event)) event.preventDefault();
  };

  return (
    <div
      data-drag-scroll
      role="region"
      aria-label={t.views.kanban}
      className="-mx-4 flex snap-x snap-mandatory gap-3 overflow-x-auto px-4 pt-1 pb-4 [scrollbar-width:thin] md:snap-none"
    >
      {columns.map((column, col) => {
        const list = byColumn.get(column.id) ?? [];
        const target = drag?.target?.columnId === column.id ? drag.target.index : null;
        const headingId = `kanban-col-${column.id}`;
        const indicator = (
          <div aria-hidden="true" className="h-1 shrink-0 rounded-pill bg-accent-fill" />
        );
        // Indices of the target are among the cards without the dragged one.
        const others = list.filter((x) => x.id !== drag?.id);
        return (
          <section
            key={column.id}
            aria-labelledby={headingId}
            data-drop-column={column.id}
            className={cn(
              'k-glass flex w-[85vw] max-w-80 shrink-0 snap-center flex-col rounded-card p-3 sm:w-72',
              target !== null && 'ring-2 ring-focus',
            )}
          >
            <h3
              id={headingId}
              className="flex items-center justify-between gap-2 px-1 pb-2 text-headline text-fg"
            >
              <span className="sr-only">{t.columnCount(column.name, list.length)}</span>
              <span aria-hidden="true" className="truncate">
                {column.name}
              </span>
              <span
                aria-hidden="true"
                className="rounded-pill bg-neutral-soft px-2 text-footnote font-semibold text-muted"
              >
                {list.length}
              </span>
            </h3>
            <ol className="flex min-h-24 flex-1 flex-col gap-2">
              {list.map((task) => {
                // The dragged card stays in place (faded) so the layout doesn't jump; drop
                // indices count only the other cards.
                const dragged = task.id === drag?.id;
                const index = dragged ? -1 : others.indexOf(task);
                return (
                  <li key={task.id} className="flex flex-col gap-2">
                    {!dragged && target === index && indicator}
                    <div>
                      <TaskCard
                        task={task}
                        subtasks={subtasks(task)}
                        today={today}
                        tabIndex={task.id === activeId ? 0 : -1}
                        canEdit={canEdit}
                        menu={menuFor(task)}
                        menuOpen={menuOpenId === task.id}
                        onMenuOpenChange={(open) => setMenuOpenId(open ? task.id : null)}
                        onOpen={() => onOpen(task)}
                        onKeyDown={onKeyDown(task, col, list.indexOf(task))}
                        onFocus={() => setFocusId(task.id)}
                        onPointerDown={handle(task.id)}
                        selected={selectedId === task.id}
                        buttonRef={(el) => {
                          if (el) buttons.current.set(task.id, el);
                          else buttons.current.delete(task.id);
                        }}
                      />
                    </div>
                  </li>
                );
              })}
              {target !== null && target >= others.length && (
                <li aria-hidden="true">{indicator}</li>
              )}
              {list.length === 0 && target === null && (
                <li className="flex min-h-16 items-center justify-center rounded-control border border-dashed border-separator text-footnote text-muted">
                  {t.emptyColumn}
                </li>
              )}
            </ol>
          </section>
        );
      })}
    </div>
  );
}

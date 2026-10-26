'use client';

import { FileText } from 'lucide-react';
import type { KeyboardEvent } from 'react';
import { PriorityBadge } from '@/components/ui/PriorityBadge';
import type { TaskItem, TasksData } from '@/lib/client/tasks';
import { cn } from '@/lib/cn';
import { it } from '@/lib/i18n/it';
import { InlineText, plainText } from './InlineText';
import { DueChip, LabelChip } from './TaskCard';

const t = it.tasks;

function MarkdownTable({ markdown }: { markdown: string }) {
  const rows = markdown
    .trim()
    .split(/\r?\n/)
    .map((line) =>
      line
        .trim()
        .replace(/^\||\|$/g, '')
        .split('|')
        .map((cell) => cell.trim()),
    );
  const [head, , ...body] = rows;
  if (!head) return null;
  return (
    <div className="overflow-x-auto rounded-control border border-separator">
      <table className="w-full text-left text-footnote">
        <thead className="bg-neutral-soft">
          <tr>
            {head.map((cell, i) => (
              <th key={i} scope="col" className="px-3 py-2 font-semibold text-fg">
                <InlineText text={cell} />
              </th>
            ))}
          </tr>
        </thead>
        <tbody>
          {body.map((row, r) => (
            <tr key={r} className="border-t border-separator">
              {row.map((cell, i) => (
                <td key={i} className="px-3 py-2 text-fg">
                  <InlineText text={cell} />
                </td>
              ))}
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}

function Row({
  task,
  depth,
  canEdit,
  today,
  selected,
  onToggle,
  onOpen,
  onShortcut,
}: {
  task: TaskItem;
  depth: number;
  canEdit: boolean;
  today: string;
  selected: boolean;
  onToggle: (task: TaskItem) => void;
  onOpen: (task: TaskItem) => void;
  onShortcut: (task: TaskItem, event: KeyboardEvent) => boolean;
}) {
  const title = plainText(task.text);
  return (
    <li
      className={cn(
        'flex items-start gap-1 rounded-control',
        selected && 'bg-accent-soft',
        depth > 0 && 'ml-7',
      )}
    >
      <label className="flex size-touch shrink-0 cursor-pointer items-center justify-center">
        <span className="sr-only">{`${t.detail.done}: ${title}`}</span>
        <input
          type="checkbox"
          checked={task.done}
          disabled={!canEdit}
          onChange={() => onToggle(task)}
          className="size-5 accent-[var(--k-accent-fill)]"
        />
      </label>
      <button
        type="button"
        data-task-button={task.id}
        onClick={() => onOpen(task)}
        onKeyDown={(event) => {
          if (onShortcut(task, event)) event.preventDefault();
        }}
        className="flex min-h-touch min-w-0 flex-1 flex-col justify-center gap-1 rounded-control px-2 py-1.5 text-left hover:bg-neutral-soft focus-visible:ring-2 focus-visible:ring-focus"
      >
        <span className={cn('text-body text-fg', task.done && 'text-muted line-through')}>
          <InlineText text={task.text} />
        </span>
        {(task.priority !== 'none' || task.dueDate || task.labels.length > 0 || task.assignee) && (
          <span className="flex flex-wrap items-center gap-1.5">
            {task.priority !== 'none' && <PriorityBadge priority={task.priority} />}
            {task.dueDate && <DueChip day={task.dueDate} today={today} done={task.done} />}
            {task.labels.map((label) => (
              <LabelChip key={label.id} label={label} />
            ))}
            {task.assignee && (
              <span className="inline-flex items-center gap-1 text-caption text-muted">
                {t.card.assignee(task.assignee.name)}
              </span>
            )}
          </span>
        )}
      </button>
    </li>
  );
}

/** All tasks as an outline: one area per file, grouped by section, subtasks nested. */
export function TaskList({
  data,
  visible,
  canEdit,
  today,
  selectedId,
  onToggle,
  onOpen,
  onShortcut,
}: {
  data: TasksData;
  visible: Set<string>;
  canEdit: boolean;
  today: string;
  selectedId: string | null;
  onToggle: (task: TaskItem) => void;
  onOpen: (task: TaskItem) => void;
  onShortcut: (task: TaskItem, event: KeyboardEvent) => boolean;
}) {
  const files = data.files
    .map((file) => {
      const sections = new Map<string, { heading: string[]; tasks: TaskItem[] }>();
      const byStable = new Map(file.tasks.map((x) => [x.stableId, x]));
      const depth = (task: TaskItem) => {
        let d = 0;
        for (let p = task.parentId; p && d < 4; p = byStable.get(p)?.parentId ?? null) d++;
        return d;
      };
      for (const task of [...file.tasks].sort((a, b) => a.line - b.line)) {
        if (!visible.has(task.id)) continue;
        const key = task.headingPath.join('\u001f');
        const section = sections.get(key) ?? { heading: task.headingPath, tasks: [] };
        section.tasks.push(task);
        sections.set(key, section);
      }
      return { file, sections: [...sections.values()], depth };
    })
    .filter((f) => f.sections.length > 0);

  return (
    <div className="flex flex-col gap-4">
      {files.map(({ file, sections, depth }, fileIndex) => (
        <section
          key={file.path}
          aria-labelledby={`tasks-file-${fileIndex}`}
          className="k-glass flex flex-col gap-3 rounded-card p-4"
        >
          <h3
            id={`tasks-file-${fileIndex}`}
            className="flex items-center gap-2 text-headline text-fg [overflow-wrap:anywhere]"
          >
            <FileText className="size-5 shrink-0 text-muted" aria-hidden="true" />
            {file.path}
          </h3>
          {sections.map((section) => {
            const label = section.heading.length ? section.heading.join(' › ') : file.path;
            const tables = file.tables.filter(
              (table) => table.headingPath.join('\u001f') === section.heading.join('\u001f'),
            );
            return (
              <div key={section.heading.join('/')} className="flex flex-col gap-1">
                {section.heading.length > 0 && (
                  <h4 className="px-1 text-footnote font-semibold tracking-wide text-muted uppercase">
                    {label}
                  </h4>
                )}
                <ul aria-label={label} className="flex flex-col">
                  {section.tasks.map((task) => (
                    <Row
                      key={task.id}
                      task={task}
                      depth={depth(task)}
                      canEdit={canEdit}
                      today={today}
                      selected={selectedId === task.id}
                      onToggle={onToggle}
                      onOpen={onOpen}
                      onShortcut={onShortcut}
                    />
                  ))}
                </ul>
                {tables.map((table) => (
                  <MarkdownTable key={table.line} markdown={table.markdown} />
                ))}
              </div>
            );
          })}
        </section>
      ))}
    </div>
  );
}

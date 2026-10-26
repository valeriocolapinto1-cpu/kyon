'use client';

import { useQueryClient } from '@tanstack/react-query';
import { ArrowLeft, ArrowRight, Trash2 } from 'lucide-react';
import { useState, type FormEvent } from 'react';
import { MAX_COLUMNS, PRIORITIES, type TaskFilters } from '@kyon/core';
import { Checkbox } from '@/components/ui/Checkbox';
import { FormError } from '@/components/ui/FormError';
import { GlassButton } from '@/components/ui/GlassButton';
import { GlassInput } from '@/components/ui/GlassInput';
import { GlassSelect } from '@/components/ui/GlassSelect';
import { Segmented } from '@/components/ui/Segmented';
import { Sheet } from '@/components/ui/Sheet';
import { useToast } from '@/components/ui/Toast';
import { ApiClientError, api } from '@/lib/client/api';
import type { ProjectDetail } from '@/lib/client/projects';
import { tasksKey, type TasksData } from '@/lib/client/tasks';
import { it } from '@/lib/i18n/it';

const t = it.tasks;

const errorText = (error: unknown) =>
  error instanceof ApiClientError ? error.message : error ? it.common.errorBody : null;

export function AddTaskSheet({
  open,
  onOpenChange,
  projectId,
  data,
}: {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  projectId: string;
  data: TasksData;
}) {
  const queryClient = useQueryClient();
  const { toast } = useToast();
  const files = data.files.filter((f) => f.kind === 'tasks');
  const [path, setPath] = useState(files[0]?.path ?? '');
  const [section, setSection] = useState('');
  const [error, setError] = useState<unknown>(null);
  const [saving, setSaving] = useState(false);
  const file = files.find((f) => f.path === path) ?? files[0];
  const sections = [
    ...new Map(
      (file?.tasks ?? [])
        .filter((x) => x.headingPath.length)
        .map((x) => [x.headingPath.join('\u001f'), x.headingPath]),
    ).values(),
  ];

  const submit = async (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    const form = event.currentTarget;
    const text = String(new FormData(form).get('text') ?? '').trim();
    if (!file || !text) return;
    setSaving(true);
    setError(null);
    try {
      const next = await api<TasksData>(`/api/projects/${projectId}/tasks`, {
        method: 'POST',
        json: {
          path: file.path,
          headingPath: section ? section.split('\u001f') : null,
          text,
        },
      });
      queryClient.setQueryData(tasksKey(projectId), next);
      toast({ tone: 'success', title: t.addSheet.added });
      form.reset();
      onOpenChange(false);
    } catch (caught) {
      setError(caught);
    } finally {
      setSaving(false);
    }
  };

  return (
    <Sheet
      open={open}
      onOpenChange={onOpenChange}
      title={t.addSheet.title}
      description={t.addSheet.description}
    >
      <form onSubmit={submit} className="flex flex-col gap-4">
        <GlassSelect
          label={t.addSheet.file}
          value={file?.path ?? ''}
          onChange={(event) => {
            setPath(event.target.value);
            setSection('');
          }}
          options={files.map((f) => ({ value: f.path, label: f.path }))}
        />
        <GlassSelect
          label={t.addSheet.section}
          value={section}
          onChange={(event) => setSection(event.target.value)}
          options={[
            { value: '', label: t.addSheet.sectionTop },
            ...sections.map((h) => ({ value: h.join('\u001f'), label: h.join(' › ') })),
          ]}
        />
        <GlassInput label={t.addSheet.text} name="text" required maxLength={500} />
        <FormError message={errorText(error)} />
        <GlassButton type="submit" variant="primary" disabled={saving} className="self-start">
          {saving ? it.sync.saving : t.addSheet.submit}
        </GlassButton>
      </form>
    </Sheet>
  );
}

export function ColumnsSheet({
  open,
  onOpenChange,
  projectId,
  data,
  canManage,
}: {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  projectId: string;
  data: TasksData;
  canManage: boolean;
}) {
  const queryClient = useQueryClient();
  const [error, setError] = useState<unknown>(null);
  const columns = [...data.columns].sort((a, b) => a.position - b.position);
  const call = async (path: string, init: RequestInit & { json?: unknown }) => {
    setError(null);
    try {
      const next = await api<TasksData>(`/api/projects/${projectId}${path}`, init);
      queryClient.setQueryData(tasksKey(projectId), next);
      return true;
    } catch (caught) {
      setError(caught);
      return false;
    }
  };
  const c = t.columnsSheet;

  return (
    <Sheet open={open} onOpenChange={onOpenChange} title={c.title} description={c.description}>
      <div className="flex flex-col gap-4">
        {!canManage && <p className="text-subhead text-muted">{c.ownerOnly}</p>}
        <ol className="flex flex-col gap-3">
          {columns.map((column, index) => (
            <li key={column.id} className="flex flex-col gap-2 rounded-control bg-neutral-soft p-3">
              <form
                className="flex items-end gap-2"
                onSubmit={(event) => {
                  event.preventDefault();
                  const name = String(new FormData(event.currentTarget).get('name') ?? '').trim();
                  if (name && name !== column.name)
                    void call(`/columns/${column.id}`, { method: 'PATCH', json: { name } });
                }}
              >
                <GlassInput
                  label={c.rename(column.name)}
                  name="name"
                  defaultValue={column.name}
                  maxLength={40}
                  disabled={!canManage}
                  hint={column.isDone || column.isInProgress ? c.special : undefined}
                  className="flex-1"
                  onBlur={(event) => event.currentTarget.form?.requestSubmit()}
                />
              </form>
              {canManage && (
                <div className="flex gap-1">
                  <GlassButton
                    size="icon"
                    variant="plain"
                    aria-label={c.moveLeft(column.name)}
                    disabled={index === 0}
                    onClick={() =>
                      void call(`/columns/${column.id}`, {
                        method: 'PATCH',
                        json: { index: index - 1 },
                      })
                    }
                  >
                    <ArrowLeft className="size-5" aria-hidden="true" />
                  </GlassButton>
                  <GlassButton
                    size="icon"
                    variant="plain"
                    aria-label={c.moveRight(column.name)}
                    disabled={index === columns.length - 1}
                    onClick={() =>
                      void call(`/columns/${column.id}`, {
                        method: 'PATCH',
                        json: { index: index + 1 },
                      })
                    }
                  >
                    <ArrowRight className="size-5" aria-hidden="true" />
                  </GlassButton>
                  {!column.isDone && !column.isInProgress && (
                    <GlassButton
                      size="icon"
                      variant="plain"
                      className="ml-auto text-danger"
                      aria-label={c.remove(column.name)}
                      onClick={() => {
                        if (window.confirm(c.removeConfirm(column.name)))
                          void call(`/columns/${column.id}`, { method: 'DELETE' });
                      }}
                    >
                      <Trash2 className="size-5" aria-hidden="true" />
                    </GlassButton>
                  )}
                </div>
              )}
            </li>
          ))}
        </ol>
        {canManage && columns.length < MAX_COLUMNS && (
          <form
            className="flex items-end gap-2"
            onSubmit={async (event) => {
              event.preventDefault();
              const form = event.currentTarget;
              const name = String(new FormData(form).get('name') ?? '').trim();
              if (name && (await call('/columns', { method: 'POST', json: { name } })))
                form.reset();
            }}
          >
            <GlassInput label={c.name} name="name" maxLength={40} required className="flex-1" />
            <GlassButton type="submit" variant="primary" size="sm">
              {c.add}
            </GlassButton>
          </form>
        )}
        <FormError message={errorText(error)} />
      </div>
    </Sheet>
  );
}

export function FiltersSheet({
  open,
  onOpenChange,
  filters,
  onChange,
  data,
  project,
  meId,
  resultCount,
}: {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  filters: TaskFilters;
  onChange: (filters: TaskFilters) => void;
  data: TasksData;
  project: ProjectDetail;
  meId: string | null;
  resultCount: number;
}) {
  const f = t.filter;
  const toggle = (key: 'assignees' | 'labels' | 'priorities' | 'files', value: string) =>
    onChange({
      ...filters,
      [key]: filters[key].includes(value)
        ? filters[key].filter((x) => x !== value)
        : [...filters[key], value],
    });
  const people = [
    ...(meId ? [{ id: meId, name: f.me }] : []),
    ...project.members.filter((m) => m.id !== meId).map((m) => ({ id: m.id, name: m.name })),
    { id: 'none', name: f.unassigned },
  ];
  const group = (legend: string, children: React.ReactNode) => (
    <fieldset className="flex flex-col">
      <legend className="mb-1 text-headline text-fg">{legend}</legend>
      {children}
    </fieldset>
  );
  return (
    <Sheet
      open={open}
      onOpenChange={onOpenChange}
      title={t.filters}
      footer={
        <>
          <GlassButton
            variant="plain"
            onClick={() =>
              onChange({
                ...filters,
                assignees: [],
                labels: [],
                priorities: [],
                files: [],
                state: 'all',
              })
            }
          >
            {t.clearFilters}
          </GlassButton>
          <GlassButton variant="primary" onClick={() => onOpenChange(false)}>
            {f.apply} ({resultCount})
          </GlassButton>
        </>
      }
    >
      <div className="flex flex-col gap-5">
        <Segmented<TaskFilters['state']>
          label={f.state}
          value={filters.state}
          onChange={(state) => onChange({ ...filters, state })}
          options={[
            { value: 'all', label: f.stateAll },
            { value: 'open', label: f.stateOpen },
            { value: 'done', label: f.stateDone },
          ]}
        />
        {group(
          f.assignee,
          people.map((p) => (
            <Checkbox
              key={p.id}
              label={p.name}
              checked={filters.assignees.includes(p.id)}
              onChange={() => toggle('assignees', p.id)}
            />
          )),
        )}
        {group(
          f.priority,
          PRIORITIES.map((p) => (
            <Checkbox
              key={p}
              label={it.priority[p]}
              checked={filters.priorities.includes(p)}
              onChange={() => toggle('priorities', p)}
            />
          )),
        )}
        {data.labels.length > 0 &&
          group(
            f.labels,
            data.labels.map((l) => (
              <Checkbox
                key={l.id}
                label={l.name}
                checked={filters.labels.includes(l.id)}
                onChange={() => toggle('labels', l.id)}
              />
            )),
          )}
        {data.files.length > 1 &&
          group(
            f.files,
            data.files.map((file) => (
              <Checkbox
                key={file.path}
                label={file.path}
                checked={filters.files.includes(file.path)}
                onChange={() => toggle('files', file.path)}
              />
            )),
          )}
      </div>
    </Sheet>
  );
}

export function ShortcutsSheet({
  open,
  onOpenChange,
}: {
  open: boolean;
  onOpenChange: (open: boolean) => void;
}) {
  const k = t.keys;
  return (
    <Sheet open={open} onOpenChange={onOpenChange} title={k.title}>
      <ul className="flex list-disc flex-col gap-2 pl-5 text-body text-fg">
        {[k.navigate, k.move, k.open, k.done, k.menu, k.priority, k.assign, k.search, k.help].map(
          (line) => (
            <li key={line}>{line}</li>
          ),
        )}
      </ul>
    </Sheet>
  );
}

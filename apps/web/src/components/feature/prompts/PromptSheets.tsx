'use client';

import { useQuery, useQueryClient } from '@tanstack/react-query';
import { useEffect, useRef, useState, type FormEvent } from 'react';
import { diffLines } from '@kyon/core';
import { FormError } from '@/components/ui/FormError';
import { GlassButton } from '@/components/ui/GlassButton';
import { GlassInput } from '@/components/ui/GlassInput';
import { GlassSelect } from '@/components/ui/GlassSelect';
import { RadioCards } from '@/components/ui/RadioCards';
import { Sheet } from '@/components/ui/Sheet';
import { SkeletonList } from '@/components/ui/Skeleton';
import { useToast } from '@/components/ui/Toast';
import { plainText } from '@/components/ui/InlineText';
import { ApiClientError, api } from '@/lib/client/api';
import { promptsKey } from '@/lib/client/projectLive';
import { useTemplates, useVersions, type PromptItem } from '@/lib/client/prompts';
import type { TaskItem } from '@/lib/client/tasks';
import { cn } from '@/lib/cn';
import { relativeTime } from '@/lib/format/relative';
import { it } from '@/lib/i18n/it';

const p = it.prompts;
const errorText = (error: unknown) =>
  error instanceof ApiClientError ? error.message : error ? it.common.errorBody : null;

export function NewPromptSheet({
  open,
  onOpenChange,
  projectId,
  tasks,
  initialTaskId,
  onCreated,
}: {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  projectId: string;
  tasks: TaskItem[];
  initialTaskId: string | null;
  onCreated: (id: string) => void;
}) {
  const queryClient = useQueryClient();
  const { toast } = useToast();
  const templates = useTemplates(projectId);
  const choices = [...tasks].sort((a, b) => Number(a.done) - Number(b.done));
  const [taskId, setTaskId] = useState(initialTaskId ?? choices[0]?.id ?? '');
  const [templateId, setTemplateId] = useState('builtin:implement');
  const [error, setError] = useState<unknown>(null);
  const [saving, setSaving] = useState(false);
  const task = tasks.find((t) => t.id === taskId);

  const submit = async (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    const title = String(new FormData(event.currentTarget).get('title') ?? '').trim();
    const template = templates.data?.find((t) => t.id === templateId);
    if (!task || !title) return;
    setSaving(true);
    setError(null);
    try {
      const { id } = await api<{ id: string }>(`/api/projects/${projectId}/prompts`, {
        method: 'POST',
        json: { taskId: task.id, title, body: template?.body ?? '' },
      });
      await queryClient.invalidateQueries({ queryKey: promptsKey(projectId) });
      toast({ tone: 'success', title: p.created });
      onCreated(id);
      onOpenChange(false);
    } catch (caught) {
      setError(caught);
    } finally {
      setSaving(false);
    }
  };

  return (
    <Sheet open={open} onOpenChange={onOpenChange} title={p.newPrompt}>
      <form onSubmit={submit} className="flex flex-col gap-4">
        <GlassSelect
          label={p.fields.task}
          value={taskId}
          onChange={(event) => setTaskId(event.target.value)}
          options={choices.map((t) => ({
            value: t.id,
            label: `${t.done ? '✓ ' : ''}${plainText(t.text)}`,
          }))}
        />
        <GlassInput
          key={taskId}
          label={p.fields.title}
          name="title"
          required
          maxLength={120}
          defaultValue={task ? plainText(task.text).slice(0, 120) : ''}
        />
        <GlassSelect
          label={p.fields.template}
          value={templateId}
          onChange={(event) => setTemplateId(event.target.value)}
          options={[
            { value: '', label: p.fields.blank },
            ...(templates.data ?? []).map((t) => ({
              value: t.id,
              label: `${t.name} · ${p.scope[t.scope]}`,
            })),
          ]}
        />
        <FormError message={errorText(error)} />
        <GlassButton
          type="submit"
          variant="primary"
          disabled={saving || !task}
          className="self-start"
        >
          {p.create}
        </GlassButton>
      </form>
    </Sheet>
  );
}

export function VersionsSheet({
  open,
  onOpenChange,
  prompt,
  onRestore,
}: {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  prompt: PromptItem;
  onRestore: (versionId: string) => void;
}) {
  const versions = useVersions(open ? prompt.id : null);
  const [selected, setSelected] = useState<string | null>(null);
  const chosen = versions.data?.find((v) => v.id === selected) ?? versions.data?.[1] ?? null;
  const diff = chosen ? diffLines(chosen.body, prompt.body) : [];
  return (
    <Sheet open={open} onOpenChange={onOpenChange} title={p.versionsTitle}>
      {versions.isPending ? (
        <SkeletonList rows={3} />
      ) : (
        <div className="flex flex-col gap-4">
          <RadioCards
            label={p.versionsTitle}
            value={chosen?.id ?? ''}
            onChange={setSelected}
            options={(versions.data ?? []).map((v) => ({
              value: v.id,
              label: p.versionLabel(v.number, v.author?.name ?? '—', relativeTime(v.createdAt)),
              description: v.number === prompt.version ? p.current : undefined,
            }))}
          />
          {chosen && chosen.number !== prompt.version && (
            <section aria-labelledby="version-diff" className="flex flex-col gap-2">
              <h3 id="version-diff" className="text-headline text-fg">
                {p.compare}
              </h3>
              {diff.every((d) => d.kind === 'same') ? (
                <p className="text-subhead text-muted">{p.noChanges}</p>
              ) : (
                <pre className="max-h-72 overflow-auto rounded-control bg-neutral-soft p-3 font-mono text-footnote">
                  {diff.map((line, i) => (
                    <div
                      key={i}
                      className={cn(
                        line.kind === 'add' && 'bg-accent-soft text-success',
                        line.kind === 'remove' && 'text-danger line-through',
                      )}
                    >
                      <span aria-hidden="true">
                        {line.kind === 'add' ? '+ ' : line.kind === 'remove' ? '− ' : '  '}
                      </span>
                      {line.kind !== 'same' && (
                        <span className="sr-only">
                          {line.kind === 'add' ? `${p.current}: ${p.added}` : p.removed}:{' '}
                        </span>
                      )}
                      {line.text || ' '}
                    </div>
                  ))}
                </pre>
              )}
              <GlassButton
                variant="primary"
                size="sm"
                className="self-start"
                onClick={() => {
                  onRestore(chosen.id);
                  onOpenChange(false);
                }}
              >
                {p.restore}
              </GlassButton>
            </section>
          )}
        </div>
      )}
    </Sheet>
  );
}

export function SaveTemplateSheet({
  open,
  onOpenChange,
  projectId,
  body,
  isAdmin,
  canProject,
}: {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  projectId: string;
  body: string;
  isAdmin: boolean;
  canProject: boolean;
}) {
  const queryClient = useQueryClient();
  const { toast } = useToast();
  const [scope, setScope] = useState<'user' | 'project' | 'group'>('user');
  const [error, setError] = useState<unknown>(null);
  const submit = async (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    const name = String(new FormData(event.currentTarget).get('name') ?? '').trim();
    if (!name) return;
    try {
      await api('/api/templates', {
        method: 'POST',
        json: { scope, name, body, projectId: scope === 'project' ? projectId : null },
      });
      await queryClient.invalidateQueries({ queryKey: ['templates', projectId] });
      toast({ tone: 'success', title: p.templateSaved });
      onOpenChange(false);
    } catch (caught) {
      setError(caught);
    }
  };
  return (
    <Sheet open={open} onOpenChange={onOpenChange} title={p.saveAsTemplate}>
      <form onSubmit={submit} className="flex flex-col gap-4">
        <GlassInput label={p.templateName} name="name" required maxLength={80} />
        <RadioCards
          label={p.templateScope}
          value={scope}
          onChange={(value) => setScope(value as typeof scope)}
          options={[
            { value: 'user', label: p.scope.user },
            ...(canProject ? [{ value: 'project', label: p.scope.project }] : []),
            ...(isAdmin ? [{ value: 'group', label: p.scope.group }] : []),
          ]}
        />
        <FormError message={errorText(error)} />
        <GlassButton type="submit" variant="primary" className="self-start">
          {p.saveAsTemplate}
        </GlassButton>
      </form>
    </Sheet>
  );
}

/** Shown when the clipboard refused: the text, selected, ready to copy by hand. */
export function ManualCopySheet({
  text,
  onOpenChange,
}: {
  text: string | null;
  onOpenChange: (open: boolean) => void;
}) {
  const ref = useRef<HTMLTextAreaElement>(null);
  useEffect(() => {
    if (text) requestAnimationFrame(() => ref.current?.select());
  }, [text]);
  return (
    <Sheet
      open={text !== null}
      onOpenChange={onOpenChange}
      title={p.copyManual}
      description={p.copyManualHelp}
    >
      <label htmlFor="manual-copy" className="sr-only">
        {p.copyManual}
      </label>
      <textarea
        id="manual-copy"
        ref={ref}
        readOnly
        value={text ?? ''}
        rows={14}
        className="w-full rounded-control border border-input-border bg-surface-solid p-3 font-mono text-footnote text-fg"
      />
    </Sheet>
  );
}

export function ClaudeMdSheet({
  open,
  onOpenChange,
  projectId,
  canWrite,
}: {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  projectId: string;
  canWrite: boolean;
}) {
  const { toast } = useToast();
  const preview = useQuery({
    queryKey: ['claude-md', projectId],
    queryFn: () =>
      api<{ markdown: string; exists: boolean }>(`/api/projects/${projectId}/claude-md`),
    enabled: open,
  });
  const [error, setError] = useState<unknown>(null);
  const markdown = preview.data?.markdown ?? '';
  return (
    <Sheet
      open={open}
      onOpenChange={onOpenChange}
      title={p.claudeMdTitle}
      description={p.claudeMdHelp}
    >
      {preview.isPending ? (
        <SkeletonList rows={4} />
      ) : preview.isError ? (
        <FormError message={errorText(preview.error)} />
      ) : (
        <div className="flex flex-col gap-3">
          {preview.data?.exists && <p className="text-subhead text-warning">{p.claudeMdExists}</p>}
          <pre
            tabIndex={0}
            aria-label={p.claudeMdTitle}
            className="max-h-80 overflow-auto rounded-control bg-neutral-soft p-3 font-mono text-footnote text-fg"
          >
            {markdown}
          </pre>
          <div className="flex flex-wrap gap-2">
            <GlassButton
              size="sm"
              onClick={() =>
                void navigator.clipboard
                  .writeText(markdown)
                  .then(() => toast({ tone: 'success', title: p.claudeMdCopied }))
                  .catch(() => toast({ tone: 'error', title: p.copyManualHelp }))
              }
            >
              {p.claudeMdCopy}
            </GlassButton>
            <GlassButton
              size="sm"
              onClick={() => {
                const url = URL.createObjectURL(new Blob([markdown], { type: 'text/markdown' }));
                const a = document.createElement('a');
                a.href = url;
                a.download = 'CLAUDE.md';
                a.click();
                setTimeout(() => URL.revokeObjectURL(url), 1000);
              }}
            >
              {p.claudeMdDownload}
            </GlassButton>
            {canWrite && !preview.data?.exists && (
              <GlassButton
                size="sm"
                variant="primary"
                onClick={async () => {
                  if (!window.confirm(p.claudeMdWriteConfirm)) return;
                  try {
                    await api(`/api/projects/${projectId}/claude-md`, { method: 'POST' });
                    toast({ tone: 'success', title: p.claudeMdWritten });
                    void preview.refetch();
                  } catch (caught) {
                    setError(caught);
                  }
                }}
              >
                {p.claudeMdWrite}
              </GlassButton>
            )}
          </div>
          <FormError message={errorText(error)} />
        </div>
      )}
    </Sheet>
  );
}

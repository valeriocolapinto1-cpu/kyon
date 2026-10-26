'use client';

import { useQueryClient } from '@tanstack/react-query';
import { Braces, Copy, FileText, History, MoreHorizontal, Save, Trash2 } from 'lucide-react';
import { Fragment, useRef, useState, type KeyboardEvent } from 'react';
import {
  ACTIVE_RUN_STATES,
  can,
  TEMPLATE_VARIABLES,
  renderTemplate,
  subtaskList,
  templateVariables,
} from '@kyon/core';
import { GlassButton } from '@/components/ui/GlassButton';
import { GlassInput } from '@/components/ui/GlassInput';
import { InlineText, plainText } from '@/components/ui/InlineText';
import { Markdown } from '@/components/ui/Markdown';
import { Menu } from '@/components/ui/Menu';
import { Segmented } from '@/components/ui/Segmented';
import { useToast } from '@/components/ui/Toast';
import { ApiClientError, api } from '@/lib/client/api';
import { useMe } from '@/lib/client/me';
import { promptsKey } from '@/lib/client/projectLive';
import type { ProjectDetail } from '@/lib/client/projects';
import {
  copyFromRequest,
  useTemplates,
  type PromptItem,
  type PromptStatus,
  type RunItem,
} from '@/lib/client/prompts';
import { tasksKey, type TaskItem } from '@/lib/client/tasks';
import { it } from '@/lib/i18n/it';
import { ManualCopySheet, SaveTemplateSheet, VersionsSheet } from './PromptSheets';
import { RunCard } from './RunCard';

const p = it.prompts;

/** Text runs of the preview with unknown `{{variables}}` marked (never silently empty). */
function highlightUnknown(text: string) {
  return text.split(/(\{\{[^}]*\}\})/g).map((part, i) =>
    /^\{\{.*\}\}$/.test(part) ? (
      <mark key={i} className="rounded bg-accent-soft px-0.5 font-mono text-danger">
        {part}
      </mark>
    ) : (
      <Fragment key={i}>
        <InlineText text={part} links />
      </Fragment>
    ),
  );
}

export function PromptEditor({
  prompt,
  runs,
  project,
  task,
  subtasks,
}: {
  prompt: PromptItem;
  runs: RunItem[];
  project: ProjectDetail;
  task: TaskItem | null;
  subtasks: TaskItem[];
}) {
  const queryClient = useQueryClient();
  const { toast } = useToast();
  const me = useMe().data ?? null;
  const templates = useTemplates(project.id);
  const canWrite = Boolean(project.permissions['project:write_prompt']);
  const canRun = Boolean(project.permissions['project:run_prompt']);
  const [draft, setDraft] = useState(prompt.body);
  const [base, setBase] = useState({ id: prompt.id, version: prompt.version });
  const [mode, setMode] = useState<'edit' | 'preview'>('edit');
  const [sheet, setSheet] = useState<null | 'versions' | 'template'>(null);
  const [manualText, setManualText] = useState<string | null>(null);
  const [copying, setCopying] = useState(false);
  const area = useRef<HTMLTextAreaElement>(null);

  // Another prompt, or a new version saved elsewhere: start from the server text.
  if (base.id !== prompt.id || base.version !== prompt.version) {
    setBase({ id: prompt.id, version: prompt.version });
    setDraft(prompt.body);
  }
  const dirty = draft !== prompt.body;
  const { unknown } = templateVariables(draft);
  const refresh = () => queryClient.invalidateQueries({ queryKey: promptsKey(project.id) });

  const call = async (path: string, init: RequestInit & { json?: unknown }) => {
    try {
      await api(path, init);
      await refresh();
      return true;
    } catch (error) {
      toast({
        tone: 'error',
        title: error instanceof ApiClientError ? error.message : it.common.errorBody,
      });
      return false;
    }
  };

  const save = async () => {
    if (!dirty) return true;
    const ok = await call(`/api/prompts/${prompt.id}`, { method: 'PATCH', json: { body: draft } });
    if (ok) toast({ tone: 'success', title: p.saved(prompt.version + 1) });
    return ok;
  };

  const insert = (name: string) => {
    const el = area.current;
    const token = `{{${name}}}`;
    if (!el) return setDraft((d) => d + token);
    const start = el.selectionStart;
    const end = el.selectionEnd;
    const next = draft.slice(0, start) + token + draft.slice(end);
    setDraft(next);
    requestAnimationFrame(() => {
      el.focus();
      el.setSelectionRange(start + token.length, start + token.length);
    });
  };

  const copy = async () => {
    const others = runs
      .filter(
        (r) =>
          r.taskId === prompt.taskId &&
          ACTIVE_RUN_STATES.includes(r.state) &&
          r.launchedBy &&
          r.launchedBy.id !== me?.id,
      )
      .map((r) => r.launchedBy?.name ?? '');
    if (others.length && !window.confirm(p.alreadyRunning([...new Set(others)].join(', ')))) return;
    setCopying(true);
    try {
      if (!(await save())) return;
      const { copied, text } = await copyFromRequest(() =>
        api<{ text: string }>(`/api/prompts/${prompt.id}/run`, { method: 'POST' }).then(
          (r) => r.text,
        ),
      );
      await Promise.all([
        refresh(),
        queryClient.invalidateQueries({ queryKey: tasksKey(project.id) }),
      ]);
      if (copied) toast({ tone: 'success', title: p.copied });
      else setManualText(text);
    } catch (error) {
      toast({
        tone: 'error',
        title: error instanceof ApiClientError ? error.message : it.common.errorBody,
      });
    } finally {
      setCopying(false);
    }
  };

  const onKeyDown = (event: KeyboardEvent<HTMLTextAreaElement>) => {
    if ((event.metaKey || event.ctrlKey) && event.key.toLowerCase() === 's') {
      event.preventDefault();
      void save();
    }
  };

  const sample = renderTemplate(draft, {
    project: project.name,
    repo: project.repo?.fullName ?? '',
    task: plainText(task?.text ?? prompt.taskText ?? ''),
    file: task?.path ?? '',
    section: task?.headingPath.join(' › ') ?? '',
    branch: 'claude/<id>-…',
    assignee: task?.assignee?.name ?? '',
    subtasks: subtaskList(subtasks.map((s) => ({ text: plainText(s.text), done: s.done }))),
    run_id: '<id>',
  });
  const promptRuns = runs.filter((r) => r.promptId === prompt.id);

  return (
    <div className="flex flex-col gap-4">
      <div className="flex flex-col gap-3">
        <GlassInput
          key={`title-${prompt.id}`}
          label={p.fields.title}
          defaultValue={prompt.title}
          maxLength={120}
          readOnly={!canWrite}
          onBlur={(event) => {
            const title = event.target.value.trim();
            if (title && title !== prompt.title)
              void call(`/api/prompts/${prompt.id}`, { method: 'PATCH', json: { title } });
          }}
        />
        <p className="text-footnote text-muted">
          {p.fields.task}:{' '}
          {prompt.taskGone ? (
            <span className="text-danger">{p.taskGone}</span>
          ) : (
            <InlineText text={prompt.taskText ?? ''} />
          )}
        </p>
        {canWrite && (
          <Segmented<PromptStatus>
            label={p.statusLabel}
            value={prompt.status}
            onChange={(status) =>
              void call(`/api/prompts/${prompt.id}`, { method: 'PATCH', json: { status } })
            }
            options={(['draft', 'ready', 'used'] as const).map((value) => ({
              value,
              label: p.status[value],
            }))}
          />
        )}
      </div>

      <div className="flex flex-wrap items-center gap-2">
        <Segmented<'edit' | 'preview'>
          label={p.previewLabel}
          value={mode}
          onChange={setMode}
          options={[
            { value: 'edit', label: p.edit },
            { value: 'preview', label: p.preview },
          ]}
        />
        {canWrite && (
          <Menu
            label={p.variables}
            entries={TEMPLATE_VARIABLES.map((name) => ({
              label: p.insert(name),
              onSelect: () => insert(name),
            }))}
            trigger={
              <GlassButton size="icon" aria-label={p.variables}>
                <Braces className="size-5" aria-hidden="true" />
              </GlassButton>
            }
          />
        )}
        {canWrite && (
          <Menu
            label={p.fields.template}
            entries={(templates.data ?? []).map((tpl) => ({
              label: `${tpl.name} · ${p.scope[tpl.scope]}`,
              onSelect: () => {
                if (!draft.trim() || window.confirm(p.replaceBody)) setDraft(tpl.body);
              },
            }))}
            trigger={
              <GlassButton size="icon" aria-label={p.fields.template}>
                <FileText className="size-5" aria-hidden="true" />
              </GlassButton>
            }
          />
        )}
        <GlassButton size="sm" onClick={() => setSheet('versions')}>
          <History className="size-4" aria-hidden="true" /> {p.versions(prompt.versionCount)}
        </GlassButton>
        {canWrite && (
          <Menu
            label={it.tasks.more}
            entries={[
              { label: p.saveAsTemplate, onSelect: () => setSheet('template') },
              {
                label: p.delete,
                icon: <Trash2 className="size-5" />,
                danger: true,
                onSelect: () => {
                  if (window.confirm(p.deleteConfirm))
                    void call(`/api/prompts/${prompt.id}`, { method: 'DELETE' }).then(
                      (ok) => ok && toast({ tone: 'success', title: p.deleted }),
                    );
                },
              },
            ]}
            trigger={
              <GlassButton size="icon" aria-label={it.tasks.more}>
                <MoreHorizontal className="size-5" aria-hidden="true" />
              </GlassButton>
            }
          />
        )}
      </div>

      {mode === 'edit' ? (
        <div className="flex flex-col gap-1">
          <label htmlFor={`prompt-body-${prompt.id}`} className="text-subhead font-medium text-fg">
            {p.fields.body}
          </label>
          <textarea
            id={`prompt-body-${prompt.id}`}
            ref={area}
            value={draft}
            readOnly={!canWrite}
            onChange={(event) => setDraft(event.target.value)}
            onKeyDown={onKeyDown}
            aria-describedby={`prompt-help-${prompt.id}`}
            aria-keyshortcuts="Control+S Meta+S"
            rows={14}
            spellCheck
            className="min-h-64 w-full rounded-control border border-input-border bg-surface-solid p-3 font-mono text-[1rem] leading-relaxed text-fg"
          />
          <p id={`prompt-help-${prompt.id}`} className="text-footnote text-muted">
            {p.fields.bodyHelp}
          </p>
        </div>
      ) : (
        <section
          aria-label={p.previewLabel}
          className="rounded-control border border-border bg-surface-solid p-4"
        >
          <Markdown source={sample.text} highlight={highlightUnknown} />
        </section>
      )}
      {unknown.length > 0 && (
        <p role="status" className="text-footnote font-medium text-danger">
          {p.unknownVariables(unknown.map((u) => `{{${u}}}`).join(', '))}
        </p>
      )}

      <div className="flex flex-wrap items-center gap-2">
        {canRun && (
          <GlassButton
            variant="primary"
            onClick={() => void copy()}
            disabled={copying || prompt.taskGone}
          >
            <Copy className="size-5" aria-hidden="true" /> {copying ? p.copying : p.copy}
          </GlassButton>
        )}
        {canWrite && (
          <GlassButton onClick={() => void save()} disabled={!dirty}>
            <Save className="size-5" aria-hidden="true" /> {p.save}
          </GlassButton>
        )}
        {dirty && <span className="text-footnote text-muted">{p.unsaved}</span>}
      </div>
      {!canWrite && <p className="text-footnote text-muted">{p.readOnly}</p>}

      <section aria-labelledby={`runs-${prompt.id}`} className="flex flex-col gap-3">
        <h3 id={`runs-${prompt.id}`} className="text-headline text-fg">
          {it.runs.title} ({promptRuns.length})
        </h3>
        {promptRuns.length === 0 && <p className="text-subhead text-muted">{it.runs.none}</p>}
        {promptRuns.map((run) => (
          <RunCard key={run.id} run={run} projectId={project.id} canRun={canRun} />
        ))}
      </section>

      <VersionsSheet
        open={sheet === 'versions'}
        onOpenChange={(open) => setSheet(open ? 'versions' : null)}
        prompt={prompt}
        onRestore={(versionId) =>
          void call(`/api/prompts/${prompt.id}/restore`, {
            method: 'POST',
            json: { versionId },
          }).then((ok) => ok && toast({ tone: 'success', title: p.restored }))
        }
      />
      <SaveTemplateSheet
        open={sheet === 'template'}
        onOpenChange={(open) => setSheet(open ? 'template' : null)}
        projectId={project.id}
        body={draft}
        isAdmin={me ? can(me, 'admin:prompts', { kind: 'group' }) : false}
        canProject={canWrite}
      />
      <ManualCopySheet text={manualText} onOpenChange={(open) => !open && setManualText(null)} />
    </div>
  );
}

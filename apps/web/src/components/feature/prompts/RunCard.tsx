'use client';

import { useQueryClient } from '@tanstack/react-query';
import { Check, Copy, ExternalLink, RefreshCw, X } from 'lucide-react';
import { useState, type FormEvent } from 'react';
import { runTimeline } from '@kyon/core';
import { GlassButton } from '@/components/ui/GlassButton';
import { GlassInput } from '@/components/ui/GlassInput';
import { GlassTextarea } from '@/components/ui/GlassTextarea';
import { useToast } from '@/components/ui/Toast';
import { ApiClientError, api } from '@/lib/client/api';
import { promptsKey } from '@/lib/client/projectLive';
import { copyFromRequest, useRunSuggestion, type RunItem } from '@/lib/client/prompts';
import { tasksKey } from '@/lib/client/tasks';
import { cn } from '@/lib/cn';
import { relativeTime } from '@/lib/format/relative';
import { it } from '@/lib/i18n/it';
import { RunStateBadge } from './RunState';

const r = it.runs;

export function useRunActions(projectId: string) {
  const queryClient = useQueryClient();
  const { toast } = useToast();
  return async (path: string, init: RequestInit & { json?: unknown }, success?: string) => {
    try {
      const result = await api<Record<string, unknown>>(path, init);
      await Promise.all([
        queryClient.invalidateQueries({ queryKey: promptsKey(projectId) }),
        queryClient.invalidateQueries({ queryKey: tasksKey(projectId) }),
      ]);
      if (success) toast({ tone: 'success', title: success });
      return result;
    } catch (error) {
      toast({
        tone: 'error',
        title: error instanceof ApiClientError ? error.message : it.common.errorBody,
      });
      return null;
    }
  };
}

/** One execution: timeline, PR and CI, link/verify/undo actions, result notes. */
export function RunCard({
  run,
  projectId,
  canRun,
}: {
  run: RunItem;
  projectId: string;
  canRun: boolean;
}) {
  const action = useRunActions(projectId);
  const { toast } = useToast();
  const [manual, setManual] = useState(false);
  const [notes, setNotes] = useState(run.resultNotes ?? '');
  const waiting = !run.prNumber && !['abandoned', 'closed', 'merged'].includes(run.state);
  // The fallback suggestion is only worth asking for after a little while.
  const [openedAt] = useState(() => Date.now());
  const ageMinutes = (openedAt - new Date(run.copiedAt).getTime()) / 60_000;
  const suggestion = useRunSuggestion(canRun && waiting && ageMinutes > 2 ? run.id : null);
  const steps = runTimeline(run.state);

  const link = (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    const prNumber = Number(new FormData(event.currentTarget).get('pr'));
    if (!Number.isInteger(prNumber) || prNumber < 1) return;
    void action(
      `/api/runs/${run.id}/link`,
      { method: 'POST', json: { prNumber, source: 'manual' } },
      r.linked,
    ).then((ok) => ok && setManual(false));
  };

  return (
    <article
      aria-labelledby={`run-${run.id}`}
      className="flex flex-col gap-3 rounded-control border border-border bg-surface-solid p-3"
    >
      <header className="flex flex-wrap items-start justify-between gap-2">
        <div className="min-w-0">
          <h4 id={`run-${run.id}`} className="font-mono text-subhead font-semibold text-fg">
            {r.label(run.id)}
          </h4>
          <p className="text-footnote text-muted">
            {r.by(run.launchedBy?.name ?? '—', relativeTime(run.copiedAt))}
            {run.promptVersion ? ` · ${r.version(run.promptVersion)}` : ''}
          </p>
        </div>
        <RunStateBadge state={run.state} prNumber={run.prNumber} />
      </header>

      <ol aria-label={r.timeline} className="flex items-center gap-1">
        {steps.map((step, i) => (
          <li key={step.key} className="flex min-w-0 flex-1 items-center gap-1">
            <span
              className={cn(
                'flex size-6 shrink-0 items-center justify-center rounded-full border-2 text-caption',
                step.status === 'done' && 'border-success bg-success-fill text-on-success',
                step.status === 'current' && 'border-accent bg-accent-soft text-accent-text',
                step.status === 'failed' && 'border-danger bg-danger-fill text-on-danger',
                step.status === 'todo' && 'border-separator text-muted',
              )}
              aria-hidden="true"
            >
              {step.status === 'done' ? (
                <Check className="size-3.5" strokeWidth={3} />
              ) : step.status === 'failed' ? (
                <X className="size-3.5" strokeWidth={3} />
              ) : (
                i + 1
              )}
            </span>
            <span className="truncate text-caption text-fg">
              {r.steps[step.key]}
              <span className="sr-only">: {r.stepStatus[step.status]}</span>
            </span>
            {i < steps.length - 1 && (
              <span aria-hidden="true" className="h-px flex-1 bg-separator" />
            )}
          </li>
        ))}
      </ol>

      {run.prNumber && run.prUrl && (
        <a
          href={run.prUrl}
          target="_blank"
          rel="noreferrer"
          className="inline-flex min-h-touch items-center gap-1 self-start text-subhead font-semibold text-accent-text"
        >
          {r.pr(run.prNumber)}
          {run.prTitle ? ` · ${run.prTitle}` : ''}
          <ExternalLink className="size-4" aria-hidden="true" />
          <span className="sr-only">
            ({run.linkSource ? r.link[run.linkSource] : ''}, si apre in una nuova scheda)
          </span>
        </a>
      )}
      {run.state === 'closed' && (
        <p className="text-footnote font-medium text-danger">{r.closedWarning}</p>
      )}

      {suggestion.data && waiting && (
        <div className="flex flex-col gap-2 rounded-control bg-accent-soft p-3" role="status">
          <p className="text-subhead text-fg">
            {r.suggestion(suggestion.data.number, suggestion.data.title)}
          </p>
          <GlassButton
            size="sm"
            variant="primary"
            className="self-start"
            onClick={() =>
              void action(
                `/api/runs/${run.id}/link`,
                {
                  method: 'POST',
                  json: { prNumber: suggestion.data?.number, source: 'suggested' },
                },
                r.linked,
              )
            }
          >
            {r.confirmLink}
          </GlassButton>
        </div>
      )}

      {canRun && (
        <div className="flex flex-wrap gap-2">
          {run.state !== 'abandoned' && (
            <GlassButton
              size="sm"
              onClick={async () => {
                const res = await action(`/api/runs/${run.id}/verify`, { method: 'POST' });
                if (res)
                  toast({
                    tone: res.found ? 'success' : 'info',
                    title: res.found ? r.verified : r.notFound,
                  });
              }}
            >
              <RefreshCw className="size-4" aria-hidden="true" /> {r.verify}
            </GlassButton>
          )}
          <GlassButton
            size="sm"
            variant="plain"
            onClick={async () => {
              const { copied } = await copyFromRequest(() =>
                api<{ text: string }>(`/api/runs/${run.id}/text`).then((x) => x.text),
              );
              toast({
                tone: copied ? 'success' : 'error',
                title: copied ? it.prompts.copied : it.prompts.copyManualHelp,
              });
            }}
          >
            <Copy className="size-4" aria-hidden="true" /> {r.copyAgain}
          </GlassButton>
          {waiting && (
            <GlassButton
              size="sm"
              variant="plain"
              onClick={() => setManual((v) => !v)}
              aria-expanded={manual}
            >
              {r.linkManual}
            </GlassButton>
          )}
          {run.taskClosedByRun && (
            <GlassButton
              size="sm"
              variant="primary"
              onClick={() =>
                void action(`/api/runs/${run.id}/undo-close`, { method: 'POST' }, r.undone)
              }
            >
              {r.undoClose}
            </GlassButton>
          )}
          {waiting && (
            <GlassButton
              size="sm"
              variant="plain"
              className="text-danger"
              onClick={() => {
                if (window.confirm(r.abandonConfirm))
                  void action(`/api/runs/${run.id}`, {
                    method: 'PATCH',
                    json: { abandoned: true },
                  });
              }}
            >
              {r.abandon}
            </GlassButton>
          )}
        </div>
      )}

      {manual && (
        <form onSubmit={link} className="flex items-end gap-2">
          <GlassInput
            label={r.prNumber}
            name="pr"
            type="number"
            inputMode="numeric"
            min={1}
            required
            className="flex-1"
          />
          <GlassButton type="submit" variant="primary" size="sm">
            {r.confirmLink}
          </GlassButton>
        </form>
      )}

      <GlassTextarea
        label={r.notes}
        value={notes}
        readOnly={!canRun}
        maxLength={5000}
        rows={2}
        onChange={(event) => setNotes(event.target.value)}
        onBlur={() => {
          if ((notes.trim() || null) !== (run.resultNotes ?? null))
            void action(
              `/api/runs/${run.id}`,
              { method: 'PATCH', json: { resultNotes: notes.trim() || null } },
              r.notesSaved,
            );
        }}
      />
    </article>
  );
}

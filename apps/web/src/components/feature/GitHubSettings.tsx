'use client';

import { useMutation, useQueryClient } from '@tanstack/react-query';
import { ExternalLink, GitBranch as Github, Lock, RefreshCw, Unlock } from 'lucide-react';
import { useSearchParams } from 'next/navigation';
import { useEffect, useState } from 'react';
import type { Exposure } from '@kyon/core';
import { Badge, type BadgeTone } from '@/components/ui/Badge';
import { Checkbox } from '@/components/ui/Checkbox';
import { GlassButton } from '@/components/ui/GlassButton';
import { GlassCard } from '@/components/ui/GlassCard';
import { RadioCards } from '@/components/ui/RadioCards';
import { Sheet } from '@/components/ui/Sheet';
import { SkeletonList } from '@/components/ui/Skeleton';
import { useToast } from '@/components/ui/Toast';
import { ApiClientError, api } from '@/lib/client/api';
import {
  githubKey,
  reposKey,
  useGitHubStatus,
  usePeople,
  useRepos,
  type RepoView,
} from '@/lib/client/github';
import type { Me } from '@/lib/client/me';
import { relativeTime } from '@/lib/format/relative';
import { it } from '@/lib/i18n/it';

const g = it.github;
const tones: Record<Exposure, BadgeTone> = {
  hidden: 'neutral',
  self: 'accent',
  selected: 'warning',
  group: 'success',
};
const message = (error: unknown) =>
  error instanceof ApiClientError ? error.message : it.common.errorBody;

function ExposureSheet({ repo, me, onClose }: { repo: RepoView; me: Me; onClose: () => void }) {
  const queryClient = useQueryClient();
  const { toast } = useToast();
  const people = usePeople();
  const [exposure, setExposure] = useState<Exposure>(repo.exposure);
  const [shared, setShared] = useState<string[]>(repo.sharedWith);
  const save = useMutation({
    mutationFn: () =>
      api<{ repos: RepoView[]; lostAccess: string[] }>(`/api/repos/${repo.id}`, {
        method: 'PATCH',
        json: { exposure, sharedWith: exposure === 'selected' ? shared : [] },
      }),
    onSuccess: (data) => {
      queryClient.setQueryData(reposKey, data.repos);
      if (data.lostAccess.length)
        toast({ title: g.lostAccess(data.lostAccess.join(', ')), tone: 'info', durationMs: 9000 });
      onClose();
    },
    onError: (error) => toast({ title: message(error), tone: 'error' }),
  });
  const others = (people.data ?? []).filter((p) => p.id !== me.id);
  return (
    <Sheet
      open
      onOpenChange={(open) => !open && onClose()}
      title={repo.fullName}
      description={g.visibility}
      footer={
        <>
          <GlassButton variant="plain" onClick={onClose}>
            {it.common.cancel}
          </GlassButton>
          <GlassButton variant="primary" onClick={() => save.mutate()} disabled={save.isPending}>
            {it.account.save}
          </GlassButton>
        </>
      }
    >
      <div className="flex flex-col gap-4">
        <RadioCards<Exposure>
          label={g.visibility}
          value={exposure}
          onChange={setExposure}
          options={(['hidden', 'self', 'selected', 'group'] as const).map((value) => ({
            value,
            label: g.exposure[value],
            description: g.exposureHelp[value],
          }))}
        />
        {exposure === 'selected' && (
          <fieldset className="flex flex-col">
            <legend className="text-subhead font-semibold text-fg">{g.pickPeople}</legend>
            {others.map((p) => (
              <Checkbox
                key={p.id}
                label={p.name}
                checked={shared.includes(p.id)}
                onChange={(e) =>
                  setShared((s) =>
                    e.target.checked ? [...s, p.id] : s.filter((id) => id !== p.id),
                  )
                }
              />
            ))}
          </fieldset>
        )}
      </div>
    </Sheet>
  );
}

export function GitHubSettings({ me }: { me: Me }) {
  const queryClient = useQueryClient();
  const { toast } = useToast();
  const params = useSearchParams();
  const status = useGitHubStatus();
  const repos = useRepos();
  const [editing, setEditing] = useState<RepoView | null>(null);

  // Feedback after returning from GitHub (?github=connected|installed|error).
  const outcome = params.get('github');
  useEffect(() => {
    if (!outcome) return;
    if (outcome === 'connected') toast({ title: g.connectedToast, tone: 'success' });
    else if (outcome === 'installed') toast({ title: g.installedToast, tone: 'success' });
    else toast({ title: g.errorToast, tone: 'error' });
    window.history.replaceState(null, '', `${window.location.pathname}#github`);
  }, [outcome, toast]);

  const sync = useMutation({
    mutationFn: () => api<{ repos: RepoView[] }>('/api/github/sync', { method: 'POST' }),
    onSuccess: (data) => {
      queryClient.setQueryData(reposKey, data.repos);
      void queryClient.invalidateQueries({ queryKey: githubKey });
      toast({ title: g.refreshed, tone: 'success' });
    },
    onError: (error) => toast({ title: message(error), tone: 'error' }),
  });
  const disconnect = useMutation({
    mutationFn: () => api('/api/github', { method: 'DELETE' }),
    onSuccess: () => {
      void queryClient.invalidateQueries({ queryKey: githubKey });
      void queryClient.invalidateQueries({ queryKey: reposKey });
      toast({ title: g.disconnected, tone: 'success' });
    },
  });

  const connection = status.data?.connection;
  const mine = (repos.data ?? []).filter((r) => r.mine);

  return (
    <GlassCard as="section" aria-labelledby="github" className="flex flex-col gap-4">
      <h2 id="github" className="flex items-center gap-2 text-title3 font-semibold text-fg">
        <Github className="size-6" aria-hidden="true" /> {g.title}
      </h2>
      {status.isPending ? (
        <SkeletonList rows={2} />
      ) : !status.data?.configured ? (
        <p className="text-subhead text-muted">{g.notConfigured}</p>
      ) : !connection || connection.needsReconnect ? (
        <div className="flex flex-col gap-3">
          <p className="text-subhead text-muted">
            {connection?.needsReconnect ? g.reconnectHelp : g.connectIntro}
          </p>
          {/* Full-page navigation to the OAuth redirect (an API route, not a page). */}
          {/* eslint-disable-next-line @next/next/no-html-link-for-pages */}
          <a
            href="/api/github/connect"
            data-plain
            className="k-pressable inline-flex min-h-touch items-center gap-2 self-start rounded-pill bg-accent-fill px-5 font-semibold text-on-accent"
          >
            <Github className="size-5" aria-hidden="true" /> {connection ? g.reconnect : g.connect}
          </a>
        </div>
      ) : (
        <>
          <div className="flex flex-wrap items-center justify-between gap-3">
            <div>
              <p className="text-body font-semibold text-fg">{g.connectedAs(connection.login)}</p>
              {connection.lastSyncAt && (
                <p className="text-footnote text-muted">{relativeTime(connection.lastSyncAt)}</p>
              )}
            </div>
            <div className="flex flex-wrap gap-2">
              <GlassButton size="sm" onClick={() => sync.mutate()} disabled={sync.isPending}>
                <RefreshCw className="size-4" aria-hidden="true" /> {g.refresh}
              </GlassButton>
              <GlassButton
                size="sm"
                variant="plain"
                onClick={() => disconnect.mutate()}
                disabled={disconnect.isPending}
              >
                {g.disconnect}
              </GlassButton>
            </div>
          </div>
          {status.data.installUrl && (
            <div className="flex flex-col gap-1">
              <a
                href={status.data.installUrl}
                data-plain
                className="k-pressable inline-flex min-h-touch items-center gap-2 self-start rounded-pill bg-neutral-soft px-4 text-subhead font-semibold text-fg"
              >
                {g.install} <ExternalLink className="size-4" aria-hidden="true" />
              </a>
              <p className="text-footnote text-muted">{g.installHelp}</p>
            </div>
          )}
          <h3 className="text-headline text-fg">{g.yourRepos}</h3>
          {repos.isPending ? (
            <SkeletonList rows={2} />
          ) : mine.length === 0 ? (
            <p className="text-subhead text-muted">{g.noRepos}</p>
          ) : (
            <ul className="flex flex-col divide-y divide-separator">
              {mine.map((repo) => (
                <li key={repo.id}>
                  <button
                    type="button"
                    onClick={() => setEditing(repo)}
                    className="k-pressable flex min-h-touch w-full flex-wrap items-center justify-between gap-2 py-3 text-left"
                  >
                    <span className="flex items-center gap-2">
                      {repo.private ? (
                        <Lock className="size-4 text-muted" aria-label={g.private} />
                      ) : (
                        <Unlock className="size-4 text-muted" aria-label={g.public} />
                      )}
                      <span className="text-body text-fg">{repo.fullName}</span>
                    </span>
                    <span className="flex flex-wrap items-center gap-1">
                      {!repo.available && <Badge tone="danger">{g.unavailable}</Badge>}
                      {repo.projectId && <Badge tone="accent">{g.isProject}</Badge>}
                      <Badge tone={tones[repo.exposure]}>{g.exposure[repo.exposure]}</Badge>
                      <span className="sr-only">— {g.visibility}</span>
                    </span>
                  </button>
                </li>
              ))}
            </ul>
          )}
        </>
      )}
      {editing && <ExposureSheet repo={editing} me={me} onClose={() => setEditing(null)} />}
    </GlassCard>
  );
}

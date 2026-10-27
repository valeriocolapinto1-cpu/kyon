'use client';

import { useQuery } from '@tanstack/react-query';
import { Download, RefreshCw } from 'lucide-react';
import { GlassButton } from '@/components/ui/GlassButton';
import { GlassCard } from '@/components/ui/GlassCard';
import { SkeletonList } from '@/components/ui/Skeleton';
import { api } from '@/lib/client/api';
import { relativeTime } from '@/lib/format/relative';
import { it } from '@/lib/i18n/it';

const h = it.health;

interface Health {
  checkedAt: string;
  config: { githubApp: boolean; email: boolean; push: boolean; siteUrl: string | null };
  webhook: { event: string; at: string } | null;
  cron: { at: string } | null;
  projects: {
    name: string | null;
    archived: boolean;
    lastSyncAt: string | null;
    lastError: string | null;
    pending: number;
  }[];
  github: { name: string; login: string; lastSyncAt: string | null; lastError: string | null }[];
  pushFailing: number;
  totals: Record<string, number>;
  databaseBytes: number | null;
}

const mb = (bytes: number) => `${(bytes / 1024 / 1024).toFixed(1)} MB`;

function Row({ label, value, ok }: { label: string; value: string; ok?: boolean }) {
  return (
    <div className="flex items-baseline justify-between gap-3 border-b border-separator py-2 last:border-0">
      <dt className="text-subhead text-fg">{label}</dt>
      <dd className="text-right text-subhead font-medium text-fg">
        {ok !== undefined && (
          <span className={ok ? 'text-success' : 'text-warning'} aria-hidden="true">
            {ok ? '● ' : '▲ '}
          </span>
        )}
        {value}
      </dd>
    </div>
  );
}

/** Admin → Salute: is everything running? Webhooks, cron, syncs, errors, storage. */
export function AdminHealth() {
  const health = useQuery({
    queryKey: ['admin-health'],
    queryFn: () => api<Health>('/api/admin/health'),
  });
  const d = health.data;
  const yesNo = (v: boolean) => (v ? h.on : h.off);
  return (
    <GlassCard
      as="section"
      aria-labelledby="health-title"
      className="flex flex-col gap-3 lg:col-span-2"
    >
      <div className="flex flex-wrap items-center justify-between gap-2">
        <h3 id="health-title" className="text-headline text-fg">
          {h.title}
        </h3>
        <div className="flex flex-wrap gap-2">
          <GlassButton size="sm" variant="glass" onClick={() => void health.refetch()}>
            <RefreshCw className="size-4" aria-hidden="true" /> {h.refresh}
          </GlassButton>
          <a
            download
            href="/api/admin/export?format=json"
            className="k-pressable k-glass inline-flex min-h-touch items-center gap-2 rounded-pill px-4 text-subhead font-semibold text-fg"
          >
            <Download className="size-4" aria-hidden="true" /> {h.exportJson}
          </a>
          <a
            download
            href="/api/admin/export?format=md"
            className="k-pressable k-glass inline-flex min-h-touch items-center gap-2 rounded-pill px-4 text-subhead font-semibold text-fg"
          >
            <Download className="size-4" aria-hidden="true" /> {h.exportMd}
          </a>
        </div>
      </div>
      <p className="text-footnote text-muted">{h.exportHelp}</p>
      {!d ? (
        <SkeletonList rows={4} />
      ) : (
        <div className="grid gap-4 md:grid-cols-2">
          <dl>
            <Row label={h.githubApp} value={yesNo(d.config.githubApp)} ok={d.config.githubApp} />
            <Row
              label={h.webhook}
              value={d.webhook ? `${d.webhook.event} · ${relativeTime(d.webhook.at)}` : h.never}
              ok={Boolean(d.webhook)}
            />
            <Row
              label={h.cron}
              value={d.cron ? relativeTime(d.cron.at) : h.never}
              ok={Boolean(d.cron && Date.parse(d.checkedAt) - Date.parse(d.cron.at) < 3600_000)}
            />
            <Row label={h.push} value={yesNo(d.config.push)} ok={d.config.push} />
            <Row label={h.email} value={yesNo(d.config.email)} />
            <Row label={h.pushFailing} value={String(d.pushFailing)} ok={d.pushFailing === 0} />
          </dl>
          <dl>
            <Row label={h.users} value={String(d.totals.users ?? 0)} />
            <Row label={h.projects} value={String(d.totals.projects ?? 0)} />
            <Row label={h.tasks} value={String(d.totals.tasks ?? 0)} />
            <Row label={h.messages} value={String(d.totals.messages ?? 0)} />
            <Row
              label={h.files}
              value={`${d.totals.attachments ?? 0} · ${mb(d.totals.attachmentBytes ?? 0)}`}
            />
            <Row
              label={h.database}
              value={d.databaseBytes === null ? '—' : `${mb(d.databaseBytes)} ${h.ofFree}`}
            />
          </dl>
          <section aria-labelledby="health-sync" className="md:col-span-2">
            <h4 id="health-sync" className="mb-1 text-subhead font-semibold text-fg">
              {h.sync}
            </h4>
            <ul className="flex flex-col gap-1">
              {d.projects.map((p, i) => (
                <li key={`${p.name ?? 'x'}-${i}`} className="text-footnote text-fg">
                  <span className={p.lastError ? 'text-danger' : 'text-success'} aria-hidden="true">
                    {p.lastError ? '▲ ' : '● '}
                  </span>
                  <span className="font-semibold">{p.name ?? h.otherProject}</span>
                  {' · '}
                  {p.lastSyncAt ? relativeTime(p.lastSyncAt) : h.never}
                  {p.pending > 0 && ` · ${h.pending(p.pending)}`}
                  {p.lastError && ` · ${h.error}: ${p.lastError}`}
                </li>
              ))}
              {d.github
                .filter((g) => g.lastError)
                .map((g) => (
                  <li key={g.login} className="text-footnote text-danger">
                    ▲ GitHub @{g.login} ({g.name}): {g.lastError}
                  </li>
                ))}
            </ul>
          </section>
        </div>
      )}
    </GlassCard>
  );
}

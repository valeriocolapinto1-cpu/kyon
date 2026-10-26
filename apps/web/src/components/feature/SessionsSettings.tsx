'use client';

import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { Laptop, Smartphone } from 'lucide-react';
import { describeUserAgent } from '@kyon/core';
import { Badge } from '@/components/ui/Badge';
import { GlassButton } from '@/components/ui/GlassButton';
import { GlassCard } from '@/components/ui/GlassCard';
import { SkeletonList } from '@/components/ui/Skeleton';
import { useToast } from '@/components/ui/Toast';
import {
  currentSession,
  listSessions,
  revokeOtherSessions,
  revokeSession,
} from '@/lib/client/auth';
import { relativeTime } from '@/lib/format/relative';
import { it } from '@/lib/i18n/it';

const a = it.account;

export function SessionsSettings() {
  const queryClient = useQueryClient();
  const { toast } = useToast();
  const sessions = useQuery({ queryKey: ['sessions'], queryFn: listSessions });
  const current = useQuery({ queryKey: ['session-current'], queryFn: currentSession });
  const refresh = () => queryClient.invalidateQueries({ queryKey: ['sessions'] });
  const revoke = useMutation({
    mutationFn: revokeSession,
    onSuccess: () => {
      toast({ title: a.revoked, tone: 'success' });
      void refresh();
    },
  });
  const revokeOthers = useMutation({
    mutationFn: revokeOtherSessions,
    onSuccess: () => {
      toast({ title: a.revokedOthers, tone: 'success' });
      void refresh();
    },
  });
  const currentToken = current.data?.session.token;
  const list = [...(sessions.data ?? [])].sort((x, y) =>
    x.token === currentToken
      ? -1
      : y.token === currentToken
        ? 1
        : y.updatedAt.localeCompare(x.updatedAt),
  );

  return (
    <GlassCard as="section" aria-labelledby="sessions-title" className="flex flex-col gap-4">
      <div>
        <h2 id="sessions-title" className="text-title3 font-semibold text-fg">
          {a.sessions}
        </h2>
        <p className="text-subhead text-muted">{a.sessionsHelp}</p>
      </div>
      {sessions.isPending ? (
        <SkeletonList rows={2} />
      ) : (
        <ul className="flex flex-col divide-y divide-separator">
          {list.map((s) => {
            const label = describeUserAgent(s.userAgent);
            const mobile = /iPhone|Android/.test(label);
            const isCurrent = s.token === currentToken;
            return (
              <li key={s.id} className="flex flex-wrap items-center justify-between gap-3 py-3">
                <div className="flex items-center gap-3">
                  {mobile ? (
                    <Smartphone className="size-6 text-muted" aria-hidden="true" />
                  ) : (
                    <Laptop className="size-6 text-muted" aria-hidden="true" />
                  )}
                  <div>
                    <p className="text-body text-fg">
                      {label} {isCurrent && <Badge tone="accent">{a.thisDevice}</Badge>}
                    </p>
                    <p className="text-footnote text-muted">
                      {a.lastActive(relativeTime(s.updatedAt))}
                    </p>
                  </div>
                </div>
                {!isCurrent && (
                  <GlassButton
                    size="sm"
                    variant="plain"
                    onClick={() => revoke.mutate(s.token)}
                    disabled={revoke.isPending}
                  >
                    {a.revoke}
                  </GlassButton>
                )}
              </li>
            );
          })}
        </ul>
      )}
      {list.length > 1 && (
        <GlassButton
          size="sm"
          variant="danger"
          className="self-start"
          onClick={() => revokeOthers.mutate()}
          disabled={revokeOthers.isPending}
        >
          {a.revokeOthers}
        </GlassButton>
      )}
    </GlassCard>
  );
}

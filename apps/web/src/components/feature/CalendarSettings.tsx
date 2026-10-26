'use client';

import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { useState } from 'react';
import { CopyField } from '@/components/ui/CopyField';
import { GlassButton } from '@/components/ui/GlassButton';
import { GlassCard } from '@/components/ui/GlassCard';
import { useToast } from '@/components/ui/Toast';
import { api } from '@/lib/client/api';
import { it } from '@/lib/i18n/it';

const c = it.calendar;
const key = ['calendar-feed'] as const;

/** The secret .ics feed: created, rotated or revoked here; its URL is shown only once. */
export function CalendarSettings() {
  const queryClient = useQueryClient();
  const { toast } = useToast();
  const [url, setUrl] = useState<string | null>(null);
  const state = useQuery({
    queryKey: key,
    queryFn: () => api<{ enabled: boolean }>('/api/me/calendar'),
  });
  const rotate = useMutation({
    mutationFn: () => api<{ url: string }>('/api/me/calendar', { method: 'POST' }),
    onSuccess: (data) => {
      setUrl(data.url);
      queryClient.setQueryData(key, { enabled: true });
    },
  });
  const revoke = useMutation({
    mutationFn: () => api('/api/me/calendar', { method: 'DELETE' }),
    onSuccess: () => {
      setUrl(null);
      queryClient.setQueryData(key, { enabled: false });
      toast({ title: c.revoked, tone: 'success' });
    },
  });
  const enabled = state.data?.enabled ?? false;

  return (
    <GlassCard as="section" aria-labelledby="calendar-title" className="flex flex-col gap-4">
      <div>
        <h2 id="calendar-title" className="text-title3 font-semibold text-fg">
          {c.title}
        </h2>
        <p className="text-subhead text-muted">{c.help}</p>
      </div>
      {url ? (
        <>
          <CopyField label={c.url} value={url} />
          <p className="text-footnote font-medium text-fg" role="status">
            {c.shownOnce}
          </p>
          <p className="text-footnote text-muted">{c.howTo}</p>
        </>
      ) : (
        enabled && <p className="text-subhead text-fg">{c.active}</p>
      )}
      <div className="flex flex-wrap gap-2">
        <GlassButton
          variant={enabled ? 'glass' : 'primary'}
          size="sm"
          disabled={rotate.isPending || state.isPending}
          onClick={() => {
            if (!enabled || window.confirm(c.rotateConfirm)) rotate.mutate();
          }}
        >
          {enabled ? c.rotate : c.create}
        </GlassButton>
        {enabled && (
          <GlassButton
            variant="plain"
            size="sm"
            disabled={revoke.isPending}
            onClick={() => {
              if (window.confirm(c.revokeConfirm)) revoke.mutate();
            }}
          >
            {c.revoke}
          </GlassButton>
        )}
      </div>
    </GlassCard>
  );
}

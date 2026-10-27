'use client';

import { useQueryClient } from '@tanstack/react-query';
import { useEffect, useRef, useState } from 'react';
import { NOTIFICATION_CHANNELS, NOTIFICATION_EVENTS, type NotificationPrefs } from '@kyon/core';
import { GlassButton } from '@/components/ui/GlassButton';
import { GlassCard } from '@/components/ui/GlassCard';
import { SkeletonList } from '@/components/ui/Skeleton';
import { Switch } from '@/components/ui/Switch';
import { useToast } from '@/components/ui/Toast';
import { api, ApiClientError } from '@/lib/client/api';
import {
  currentPushSubscription,
  disablePush,
  enablePush,
  needsInstallForPush,
  notificationsKey,
  pushSupported,
  useNotificationPrefs,
  useNotificationSetup,
} from '@/lib/client/notifications';
import { it } from '@/lib/i18n/it';

const t = it.notifications;

function Matrix({
  prefs,
  onChange,
  emailAvailable,
}: {
  prefs: NotificationPrefs;
  onChange: (next: NotificationPrefs) => void;
  emailAvailable: boolean;
}) {
  return (
    <div className="overflow-x-auto">
      <table className="w-full min-w-[22rem] border-collapse text-left">
        <caption className="sr-only">{t.settingsTitle}</caption>
        <thead>
          <tr>
            <th scope="col" className="py-2 pr-3 text-footnote font-semibold text-muted">
              <span className="sr-only">Evento</span>
            </th>
            {NOTIFICATION_CHANNELS.map((channel) => (
              <th
                key={channel}
                scope="col"
                className="px-2 py-2 text-center text-footnote font-semibold text-muted"
              >
                {t.channels[channel]}
              </th>
            ))}
          </tr>
        </thead>
        <tbody className="divide-y divide-separator">
          {NOTIFICATION_EVENTS.map((event) => (
            <tr key={event}>
              <th scope="row" className="py-2 pr-3 text-subhead font-medium text-fg">
                {t.events[event]}
              </th>
              {NOTIFICATION_CHANNELS.map((channel) => (
                <td key={channel} className="px-2 py-1 text-center">
                  <input
                    type="checkbox"
                    aria-label={t.channelFor(
                      t.channels[channel] ?? channel,
                      t.events[event] ?? event,
                    )}
                    checked={prefs.matrix[event][channel]}
                    disabled={channel === 'email' && !emailAvailable}
                    onChange={(e) =>
                      onChange({
                        ...prefs,
                        matrix: {
                          ...prefs.matrix,
                          [event]: { ...prefs.matrix[event], [channel]: e.target.checked },
                        },
                      })
                    }
                    className="size-6 accent-[var(--k-accent-fill)] disabled:opacity-40"
                  />
                </td>
              ))}
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}

type PushState = 'unknown' | 'unsupported' | 'install' | 'off' | 'on' | 'denied';

function PushSection({ vapidKey, devices }: { vapidKey: string | null; devices: number }) {
  const queryClient = useQueryClient();
  const { toast } = useToast();
  const [state, setState] = useState<PushState>('unknown');
  const [busy, setBusy] = useState(false);

  useEffect(() => {
    let cancelled = false;
    const detect = async (): Promise<PushState> => {
      if (needsInstallForPush()) return 'install';
      if (!pushSupported()) return 'unsupported';
      if (Notification.permission === 'denied') return 'denied';
      return (await currentPushSubscription()) ? 'on' : 'off';
    };
    detect().then(
      (s) => !cancelled && setState(s),
      (error: unknown) => {
        console.warn('Push state unavailable', error);
        if (!cancelled) setState('unsupported');
      },
    );
    return () => {
      cancelled = true;
    };
  }, []);

  const refresh = () => queryClient.invalidateQueries({ queryKey: ['notification-setup'] });
  const toggle = async () => {
    if (!vapidKey) return;
    setBusy(true);
    try {
      if (state === 'on') {
        await disablePush();
        setState('off');
      } else {
        setState((await enablePush(vapidKey)) === 'enabled' ? 'on' : 'denied');
      }
      void refresh();
    } catch (error) {
      toast({
        tone: 'error',
        title: error instanceof ApiClientError ? error.message : it.common.errorBody,
      });
    } finally {
      setBusy(false);
    }
  };

  return (
    <section aria-labelledby="push-title" className="flex flex-col gap-2">
      <h3 id="push-title" className="text-headline text-fg">
        {t.pushTitle}
      </h3>
      {state === 'install' ? (
        <div className="rounded-control bg-neutral-soft p-3">
          <p className="text-subhead font-semibold text-fg">{t.iosTitle}</p>
          <p className="text-subhead text-fg">{t.iosSteps}</p>
        </div>
      ) : !vapidKey ? (
        <p className="text-subhead text-muted">{t.pushNoKey}</p>
      ) : state === 'unsupported' ? (
        <p className="text-subhead text-muted">{t.pushUnsupported}</p>
      ) : state === 'denied' ? (
        <p className="text-subhead text-fg" role="status">
          {t.pushDenied}
        </p>
      ) : (
        <>
          {state === 'on' && <p className="text-subhead text-fg">{t.pushActive}</p>}
          <GlassButton
            size="sm"
            variant={state === 'on' ? 'glass' : 'primary'}
            disabled={busy || state === 'unknown'}
            onClick={() => void toggle()}
            className="self-start"
          >
            {state === 'on' ? t.pushOff : t.pushOn}
          </GlassButton>
        </>
      )}
      {devices > 0 && <p className="text-footnote text-muted">{t.devices(devices)}</p>}
    </section>
  );
}

/** Settings → Notifiche: event × channel, quiet hours, push on this device, a test. */
export function NotificationSettings() {
  const queryClient = useQueryClient();
  const { toast } = useToast();
  const prefs = useNotificationPrefs();
  const setup = useNotificationSetup();

  // Edits show at once (a controlled checkbox must not flicker back while the cache updates).
  // Edits show at once (a controlled checkbox must not flicker back while the cache updates).
  const [draft, setDraft] = useState<NotificationPrefs | null>(null);
  const current = draft ?? prefs.data;
  // One request at a time, always with the newest draft: answers can't arrive out of order.
  const latest = useRef<NotificationPrefs | null>(null);
  const inFlight = useRef(false);
  const flush = async () => {
    if (inFlight.current) return;
    inFlight.current = true;
    try {
      while (latest.current) {
        const next = latest.current;
        latest.current = null;
        const saved = await api<NotificationPrefs>('/api/me/notifications', {
          method: 'PUT',
          json: next,
        });
        if (!latest.current) queryClient.setQueryData(['notification-prefs'], saved);
      }
    } catch (error) {
      latest.current = null;
      setDraft(null);
      void prefs.refetch();
      toast({
        tone: 'error',
        title: error instanceof ApiClientError ? error.message : it.common.errorBody,
      });
    } finally {
      inFlight.current = false;
    }
  };
  const save = (next: NotificationPrefs) => {
    setDraft(next);
    latest.current = next;
    void flush();
  };

  const sendTest = async () => {
    await api('/api/notifications/test', { method: 'POST' });
    await queryClient.invalidateQueries({ queryKey: notificationsKey });
    toast({ tone: 'success', title: t.testSent });
  };

  return (
    <GlassCard as="section" aria-labelledby="notifications-title" className="flex flex-col gap-4">
      <div>
        <h2 id="notifications-title" className="text-title3 font-semibold text-fg">
          {t.settingsTitle}
        </h2>
        <p className="text-subhead text-muted">{t.settingsHelp}</p>
      </div>
      {!current || !setup.data ? (
        <SkeletonList rows={3} />
      ) : (
        <>
          <Matrix
            prefs={current}
            onChange={(next) => save(next)}
            emailAvailable={setup.data.emailAvailable}
          />
          <p className="text-footnote text-muted">
            {setup.data.emailAvailable ? t.emailNote : t.emailOff}
          </p>
          <fieldset className="flex flex-col gap-3">
            <legend className="mb-2 text-headline text-fg">{t.quiet}</legend>
            <div className="flex flex-wrap gap-4">
              {(['quietStart', 'quietEnd'] as const).map((key) => (
                <label key={key} className="flex flex-col gap-1 text-subhead font-medium text-fg">
                  {key === 'quietStart' ? t.quietFrom : t.quietTo}
                  <input
                    type="time"
                    value={current[key]}
                    onChange={(e) => e.target.value && save({ ...current, [key]: e.target.value })}
                    className="min-h-touch rounded-control border border-input-border bg-surface-solid px-3 text-[1rem] text-fg"
                  />
                </label>
              ))}
            </div>
            <Switch
              label={t.mentionsInQuiet}
              checked={current.mentionsInQuiet}
              onCheckedChange={(checked) => save({ ...current, mentionsInQuiet: checked })}
            />
          </fieldset>
          <PushSection vapidKey={setup.data.vapidPublicKey} devices={setup.data.devices.length} />
          <GlassButton
            size="sm"
            variant="glass"
            className="self-start"
            onClick={() => void sendTest()}
          >
            {t.test}
          </GlassButton>
        </>
      )}
    </GlassCard>
  );
}

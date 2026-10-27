'use client';

import { useQuery, useQueryClient } from '@tanstack/react-query';
import { useEffect } from 'react';
import { base64UrlDecode, type NotificationPrefs } from '@kyon/core';
import { api } from './api';
import { useMe } from './me';
import { useGroupLive } from './presence';

export interface NotificationItem {
  id: string;
  type: string;
  title: string;
  body: string;
  url: string;
  count: number;
  read: boolean;
  createdAt: string;
  updatedAt: string;
}

interface Center {
  unread: number;
  hasMore: boolean;
  notifications: NotificationItem[];
}

export const notificationsKey = ['notifications'] as const;

/** The bell: list and unread count, refreshed live when the group room says "notify". */
export function useNotifications() {
  const queryClient = useQueryClient();
  const me = useMe().data;
  const { live } = useGroupLive();
  const query = useQuery({
    queryKey: notificationsKey,
    queryFn: () => api<Center>('/api/notifications'),
    enabled: Boolean(me),
  });
  // News sent while the socket was (re)connecting would be missed: refetch once it's open.
  const status = live?.status;
  useEffect(() => {
    if (status === 'open') void queryClient.invalidateQueries({ queryKey: notificationsKey });
  }, [status, queryClient]);
  useEffect(() => {
    if (!live || !me) return;
    return live.subscribe((event) => {
      if (event.type === 'resync' || (event.type === 'notify' && event.userIds.includes(me.id)))
        void queryClient.invalidateQueries({ queryKey: notificationsKey });
    });
  }, [live, me, queryClient]);
  return query;
}

export async function markRead(ids: string[] | 'all') {
  await api('/api/notifications/read', { method: 'POST', json: { ids } });
}

export function useNotificationPrefs() {
  return useQuery({
    queryKey: ['notification-prefs'],
    queryFn: () => api<NotificationPrefs>('/api/me/notifications'),
  });
}

export interface NotificationSetup {
  vapidPublicKey: string | null;
  emailAvailable: boolean;
  devices: { id: string; userAgent: string | null; createdAt: string; endpoint: string }[];
}

export function useNotificationSetup() {
  return useQuery({
    queryKey: ['notification-setup'],
    queryFn: () => api<NotificationSetup>('/api/notifications/setup'),
  });
}

// ---------- Web Push on this device ----------

export const pushSupported = () =>
  typeof window !== 'undefined' &&
  'serviceWorker' in navigator &&
  'PushManager' in window &&
  'Notification' in window;

/** iPhone/iPad Safari: push only from the installed app (Home screen), iOS 16.4+. */
export function needsInstallForPush() {
  if (typeof navigator === 'undefined') return false;
  const ios =
    /iPhone|iPad|iPod/.test(navigator.userAgent) ||
    (navigator.platform === 'MacIntel' && navigator.maxTouchPoints > 1);
  const standalone =
    window.matchMedia('(display-mode: standalone)').matches ||
    (navigator as Navigator & { standalone?: boolean }).standalone === true;
  return ios && !standalone;
}

async function registration() {
  return navigator.serviceWorker.register('/sw.js', { scope: '/' });
}

export async function currentPushSubscription() {
  if (!pushSupported()) return null;
  const reg = await navigator.serviceWorker.getRegistration('/');
  return (await reg?.pushManager.getSubscription()) ?? null;
}

/** Asks permission (must follow a tap), subscribes and tells the server. */
export async function enablePush(vapidPublicKey: string): Promise<'enabled' | 'denied'> {
  const permission = await Notification.requestPermission();
  if (permission !== 'granted') return 'denied';
  const reg = await registration();
  await navigator.serviceWorker.ready;
  const subscription =
    (await reg.pushManager.getSubscription()) ??
    (await reg.pushManager.subscribe({
      userVisibleOnly: true,
      applicationServerKey: base64UrlDecode(vapidPublicKey),
    }));
  await api('/api/push/subscriptions', { method: 'POST', json: subscription.toJSON() });
  return 'enabled';
}

export async function disablePush() {
  const subscription = await currentPushSubscription();
  if (!subscription) return;
  await api('/api/push/subscriptions', {
    method: 'DELETE',
    json: { endpoint: subscription.endpoint },
  });
  await subscription.unsubscribe();
}

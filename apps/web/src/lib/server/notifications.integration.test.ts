import { base64UrlEncode, generateVapidKeys } from '@kyon/core';
import { afterAll, beforeAll, beforeEach, describe, expect, it, vi } from 'vitest';
import { createDb } from '@/db/client';
import type { CookieJar } from '@/test/d1';
import { createTestD1, testEnv } from '@/test/d1';
import { createFakeGitHub, installFakeFetch } from '@/test/fakeGithub';
import { connectGitHub, fakeRepo, projectFromRepo } from '@/test/github';
import { body, call, inviteAndJoin, joinAs } from '@/test/http';
import { notifyDueTasks } from './notifications/sources';

let env: CloudflareEnv;
vi.mock('@/lib/server/env', () => ({ getEnv: async () => env }));

const fake = createFakeGitHub();
const PUSH = 'http://push.test';

type Notification = { title: string; body: string; url: string; count: number; read: boolean };
type Center = { unread: number; notifications: (Notification & { id: string })[] };

/** Rome time window around "now", for quiet-hours tests. */
function windowAroundNow() {
  const fmt = (d: Date) =>
    new Intl.DateTimeFormat('en-GB', {
      timeZone: 'Europe/Rome',
      hour: '2-digit',
      minute: '2-digit',
      hourCycle: 'h23',
    }).format(d);
  return {
    quietStart: fmt(new Date(Date.now() - 3600_000)),
    quietEnd: fmt(new Date(Date.now() + 3600_000)),
  };
}

describe('notifications', () => {
  let dispose: () => Promise<void>;
  let restore: () => void;
  let valerio: CookieJar;
  let christian: CookieJar;
  let sara: CookieJar;
  let christianId: string;
  let projectId: string;
  let taskId: string;
  let d1: D1Database;
  const pushes: { url: string; headers: Headers; status: number }[] = [];
  let pushStatus = 201;
  const emails: { to: string; subject: string; text: string }[] = [];

  const send = (jar: CookieJar, roomId: string, text: string) =>
    call(`/api/chat/rooms/${roomId}/messages`, {
      method: 'POST',
      jar,
      json: { clientId: crypto.randomUUID(), body: text },
    });
  const center = async (jar: CookieJar) =>
    (await body(call('/api/notifications', { jar }))) as Center;
  const setPrefs = (jar: CookieJar, prefs: unknown) =>
    call('/api/me/notifications', { method: 'PUT', jar, json: prefs });

  beforeAll(async () => {
    const test = await createTestD1();
    dispose = test.dispose;
    d1 = test.db;
    const vapid = await generateVapidKeys();
    env = testEnv(test.db, {
      ADMIN_BOOTSTRAP_CODE: 'bootstrap-code-for-tests',
      VAPID_PUBLIC_KEY: vapid.publicKey,
      VAPID_PRIVATE_KEY: vapid.privateKey,
      PUSH_TEST_ORIGIN: PUSH,
      KYON_URL: 'https://kyon.test',
      EMAIL_FROM: 'kyon@cerbero.test',
      EMAIL: {
        send: async (message: EmailOutgoing) => {
          emails.push(message);
          return { messageId: 'x' };
        },
      },
    });
    const restoreGithub = installFakeFetch(fake);
    const github = globalThis.fetch;
    globalThis.fetch = (async (input: RequestInfo | URL, init?: RequestInit) => {
      const request = new Request(input, init);
      if (request.url.startsWith(PUSH)) {
        pushes.push({ url: request.url, headers: request.headers, status: pushStatus });
        return new Response(null, { status: pushStatus });
      }
      return github(request);
    }) as typeof fetch;
    restore = () => {
      globalThis.fetch = github;
      restoreGithub();
    };
    valerio = await joinAs('bootstrap-code-for-tests', 'Valerio', 'valerio@kyon.test');
    christian = await inviteAndJoin(valerio, 'Christian', 'christian@kyon.test');
    christianId = (await body(call('/api/me', { jar: christian }))).id;
    await fakeRepo(fake, 'valerio-notify', 'n', { 'TASKS.md': '# T\n\n- [ ] Scrivere i test\n' });
    await connectGitHub(valerio, 'valerio-notify');
    projectId = await projectFromRepo(valerio, 'valerio-notify/n', 'Notifiche');
    sara = await inviteAndJoin(valerio, 'Sara', 'sara@kyon.test'); // not in the project
    const tasks = await body(
      call(`/api/projects/${projectId}/sync`, { method: 'POST', jar: valerio }),
    );
    taskId = tasks.files[0].tasks[0].id;
  }, 30_000);
  afterAll(async () => {
    restore();
    await dispose();
  });
  beforeEach(() => {
    pushes.length = 0;
    emails.length = 0;
    pushStatus = 201;
  });

  it('mentions and project messages, merged while unread; nothing for outsiders', async () => {
    const room = `project:${projectId}`;
    expect((await send(valerio, room, 'Ciao @Christian, guardi la PR?')).status).toBe(201);
    let mine = await center(christian);
    expect(mine.unread).toBe(1);
    expect(mine.notifications[0]).toMatchObject({
      title: 'Valerio ti ha menzionato in Notifiche',
      body: 'Valerio: Ciao @Christian, guardi la PR?',
      url: `/chat?room=${encodeURIComponent(room)}`,
    });

    await send(valerio, room, 'Primo');
    await send(valerio, room, 'Secondo');
    mine = await center(christian);
    expect(mine.unread).toBe(2);
    expect(mine.notifications[0]).toMatchObject({
      title: '2 nuovi messaggi in Notifiche',
      body: 'Valerio: Secondo',
      count: 2,
    });
    // The author and someone outside the project get nothing.
    expect((await center(valerio)).unread).toBe(0);
    expect((await center(sara)).notifications).toEqual([]);

    // Group chat: only mentions notify.
    await send(valerio, 'general', 'Buongiorno a tutti, anche a @Sara');
    expect((await center(sara)).notifications.map((n) => n.title)).toEqual([
      'Valerio ti ha menzionato in Chat del gruppo',
    ]);
    expect((await center(christian)).unread).toBe(2);
  });

  it('marks read (only my own); a read group starts a new one', async () => {
    const mine = await center(christian);
    const saras = await center(sara);
    await call('/api/notifications/read', {
      method: 'POST',
      jar: christian,
      json: { ids: [mine.notifications[0]?.id, saras.notifications[0]?.id] },
    });
    expect((await center(christian)).unread).toBe(1);
    expect((await center(sara)).unread).toBe(1);
    await call('/api/notifications/read', { method: 'POST', jar: christian, json: { ids: 'all' } });
    expect((await center(christian)).unread).toBe(0);
    await send(valerio, `project:${projectId}`, 'Terzo');
    const after = await center(christian);
    expect(after.unread).toBe(1);
    expect(after.notifications[0]).toMatchObject({
      title: 'Nuovo messaggio in Notifiche',
      count: 1,
    });
  });

  it('push: only real push services, encrypted with VAPID; gone devices are removed', async () => {
    const browser = (await crypto.subtle.generateKey({ name: 'ECDH', namedCurve: 'P-256' }, true, [
      'deriveBits',
    ])) as CryptoKeyPair;
    const p256dh = base64UrlEncode(
      new Uint8Array(await crypto.subtle.exportKey('raw', browser.publicKey)),
    );
    const auth = base64UrlEncode(crypto.getRandomValues(new Uint8Array(16)));
    const forged = await call('/api/push/subscriptions', {
      method: 'POST',
      jar: christian,
      json: { endpoint: 'https://169.254.169.254/latest/meta-data', keys: { p256dh, auth } },
    });
    expect(forged.status).toBe(400);
    const ok = await call('/api/push/subscriptions', {
      method: 'POST',
      jar: christian,
      json: { endpoint: `${PUSH}/device/1`, keys: { p256dh, auth } },
    });
    expect(ok.status).toBe(201);
    const setup = await body(call('/api/notifications/setup', { jar: christian }));
    expect(setup).toMatchObject({ vapidPublicKey: env.VAPID_PUBLIC_KEY, emailAvailable: true });
    expect(setup.devices).toHaveLength(1);

    await setPrefs(christian, { quietStart: '00:00', quietEnd: '00:00' }); // no quiet hours
    await send(valerio, `project:${projectId}`, 'Ehi @Christian');
    expect(pushes).toHaveLength(1);
    expect(pushes[0]?.url).toBe(`${PUSH}/device/1`);
    expect(pushes[0]?.headers.get('content-encoding')).toBe('aes128gcm');
    expect(pushes[0]?.headers.get('authorization')).toMatch(/^vapid t=.+, k=/);
    // Plain messages don't push by default.
    await send(valerio, `project:${projectId}`, 'Solo un messaggio');
    expect(pushes).toHaveLength(1);

    pushStatus = 410;
    await send(valerio, `project:${projectId}`, 'Di nuovo @Christian');
    expect(pushes).toHaveLength(2);
    expect((await body(call('/api/notifications/setup', { jar: christian }))).devices).toEqual([]);
  });

  it('email follows the matrix; quiet hours keep only in-app', async () => {
    await setPrefs(christian, {
      matrix: { assigned: { inapp: true, push: true, email: true } },
      quietStart: '00:00',
      quietEnd: '00:00',
    });
    const patch = (assigneeId: string | null) =>
      call(`/api/projects/${projectId}/tasks/${taskId}`, {
        method: 'PATCH',
        jar: valerio,
        json: { assigneeId },
      });
    await patch(christianId);
    expect(emails).toEqual([
      expect.objectContaining({
        to: 'christian@kyon.test',
        subject: 'Kyon · Valerio ti ha assegnato una task',
      }),
    ]);
    expect(emails[0]?.text).toContain(`https://kyon.test/progetti?id=${projectId}&task=${taskId}`);
    expect((await center(christian)).notifications[0]?.title).toBe(
      'Valerio ti ha assegnato una task',
    );

    await setPrefs(christian, {
      matrix: { assigned: { inapp: true, push: true, email: true } },
      ...windowAroundNow(),
    });
    await patch(null);
    emails.length = 0;
    const before = (await center(christian)).unread;
    await patch(christianId);
    expect(emails).toEqual([]);
    expect((await center(christian)).unread).toBe(before + 1);
    // Saved preferences come back complete and clean.
    const saved = await body(call('/api/me/notifications', { jar: christian }));
    expect(saved.matrix.mention).toEqual({ inapp: true, push: true, email: false });
    expect(saved.timeZone).toBe('Europe/Rome');
  });

  it('muted chats stay silent; mentions still arrive in-app', async () => {
    await call('/api/notifications/read', { method: 'POST', jar: christian, json: { ids: 'all' } });
    const room = `project:${projectId}`;
    await call(`/api/chat/rooms/${encodeURIComponent(room)}/mute`, {
      method: 'PUT',
      jar: christian,
    });
    await send(valerio, room, 'Nessuno mi sente');
    expect((await center(christian)).unread).toBe(0);
    await send(valerio, room, 'Tranne @Christian');
    expect((await center(christian)).notifications[0]?.title).toBe(
      'Valerio ti ha menzionato in Notifiche',
    );
    await call(`/api/chat/rooms/${encodeURIComponent(room)}/mute`, {
      method: 'DELETE',
      jar: christian,
    });
  });

  it('due reminders: the day before and the same day, once each', async () => {
    const db = createDb(d1);
    await call(`/api/projects/${projectId}/tasks/${taskId}`, {
      method: 'PATCH',
      jar: valerio,
      json: { assigneeId: christianId, dueDate: '2031-05-10' },
    });
    await call('/api/notifications/read', { method: 'POST', jar: christian, json: { ids: 'all' } });
    const dayBefore = new Date('2031-05-09T09:00:00+02:00');
    expect(await notifyDueTasks(db, env, dayBefore)).toBe(1);
    await notifyDueTasks(db, env, dayBefore); // cron runs again: no duplicate
    let mine = await center(christian);
    expect(mine.unread).toBe(1);
    expect(mine.notifications[0]).toMatchObject({
      title: 'Scade domani',
      body: 'Scrivere i test · Notifiche',
    });
    await notifyDueTasks(db, env, new Date('2031-05-10T08:15:00+02:00'));
    mine = await center(christian);
    expect(mine.unread).toBe(2);
    expect(mine.notifications[0]?.title).toBe('Scade oggi');
    expect((await center(sara)).notifications.some((n) => n.title.startsWith('Scade'))).toBe(false);
  });

  it('test notification reaches in-app and push', async () => {
    const res = await body(call('/api/notifications/test', { method: 'POST', jar: christian }));
    expect(res).toEqual({ sent: 0, removed: 0 }); // no device left after the 410
    expect((await center(christian)).notifications[0]?.title).toBe('Notifica di prova');
  });
});

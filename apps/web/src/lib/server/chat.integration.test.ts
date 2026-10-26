import { afterAll, beforeAll, describe, expect, it, vi } from 'vitest';
import type { CookieJar } from '@/test/d1';
import { createTestD1, testEnv } from '@/test/d1';
import { createFakeGitHub, installFakeFetch } from '@/test/fakeGithub';
import { connectGitHub, fakeRepo, projectFromRepo } from '@/test/github';
import { ORIGIN, body, call, inviteAndJoin, joinAs } from '@/test/http';

let env: CloudflareEnv;
vi.mock('@/lib/server/env', () => ({ getEnv: async () => env }));

const fake = createFakeGitHub();

type Message = {
  id: string;
  seq: number;
  clientId: string;
  body: string;
  deleted: boolean;
  edited: boolean;
  mentions: string[];
  replyTo: { id: string; excerpt: string } | null;
  reactions: { emoji: string; count: number; mine: boolean }[];
  attachments: { id: string; name: string; url: string }[];
  pinned: boolean;
  author: { name: string } | null;
};

const clientId = () => crypto.randomUUID();

describe('chat', () => {
  let dispose: () => Promise<void>;
  let restore: () => void;
  let valerio: CookieJar;
  let christian: CookieJar;
  let sara: CookieJar;
  let christianId: string;
  let projectId: string;
  let taskId: string;
  const projectRoom = () => `project:${projectId}`;
  const send = (
    jar: CookieJar,
    roomId: string,
    text: string,
    extra: Record<string, unknown> = {},
  ) =>
    call(`/api/chat/rooms/${roomId}/messages`, {
      method: 'POST',
      jar,
      json: { clientId: clientId(), body: text, ...extra },
    });
  const list = async (jar: CookieJar, roomId: string, query = '') =>
    body(call(`/api/chat/rooms/${roomId}/messages${query}`, { jar })) as Promise<{
      messages: Message[];
      hasMore: boolean;
      canWrite: boolean;
    }>;

  beforeAll(async () => {
    const d1 = await createTestD1();
    dispose = d1.dispose;
    env = testEnv(d1.db, { ADMIN_BOOTSTRAP_CODE: 'bootstrap-code-for-tests', FILES: d1.files });
    restore = installFakeFetch(fake);
    valerio = await joinAs('bootstrap-code-for-tests', 'Valerio', 'valerio@kyon.test');
    christian = await inviteAndJoin(valerio, 'Christian', 'christian@kyon.test');
    christianId = (await body(call('/api/me', { jar: christian }))).id;
    await fakeRepo(fake, 'valerio-chat', 'chat', { 'TASKS.md': '# T\n\n- [ ] Una task\n' });
    await connectGitHub(valerio, 'valerio-chat');
    projectId = await projectFromRepo(valerio, 'valerio-chat/chat', 'Chat');
    // Sara joins after the project: in the group, not in the project.
    sara = await inviteAndJoin(valerio, 'Sara', 'sara@kyon.test');
    const tasks = await body(
      call(`/api/projects/${projectId}/sync`, { method: 'POST', jar: valerio }),
    );
    taskId = tasks.files[0].tasks[0].id;
  }, 30_000);
  afterAll(async () => {
    restore();
    await dispose();
  });

  it('orders messages with a per-room sequence and ignores retries of the same client id', async () => {
    const first = await body(send(valerio, 'general', 'Ciao a tutti'));
    const fixed = clientId();
    const a = await body(
      call('/api/chat/rooms/general/messages', {
        method: 'POST',
        jar: christian,
        json: { clientId: fixed, body: 'Ciao!' },
      }),
    );
    const b = await body(
      call('/api/chat/rooms/general/messages', {
        method: 'POST',
        jar: christian,
        json: { clientId: fixed, body: 'Ciao!' },
      }),
    );
    expect(b.id).toBe(a.id);
    expect(a.seq).toBe(first.seq + 1);
    const { messages } = await list(sara, 'general');
    expect(messages.map((m) => m.body)).toEqual(['Ciao a tutti', 'Ciao!']);
    // Catching up after a reconnection.
    const after = await list(sara, 'general', `?after=${first.seq}`);
    expect(after.messages.map((m) => m.body)).toEqual(['Ciao!']);
  });

  it('pages back 50 at a time', async () => {
    for (let i = 0; i < 55; i++) await send(valerio, 'general', `n${i}`);
    const page = await list(valerio, 'general');
    expect(page.messages).toHaveLength(50);
    expect(page.hasMore).toBe(true);
    const older = await list(valerio, 'general', `?before=${page.messages[0]?.seq}`);
    expect(older.messages.length).toBe(7);
    expect(older.hasMore).toBe(false);
  }, 30_000);

  it('project chat: members only; mentions only of room members; replies', async () => {
    expect((await call(`/api/chat/rooms/${projectRoom()}/messages`, { jar: sara })).status).toBe(
      404,
    );
    expect((await send(sara, projectRoom(), 'intrusa')).status).toBe(404);
    const question = await body(send(valerio, projectRoom(), 'Ehi @Christian e @Sara, ci siete?'));
    expect(question.mentions).toEqual([christianId]); // Sara is not in the project
    const reply = await body(send(christian, projectRoom(), 'Sì!', { replyToId: question.id }));
    expect(reply.replyTo).toMatchObject({
      id: question.id,
      excerpt: 'Ehi @Christian e @Sara, ci siete?',
    });
    expect((await send(christian, projectRoom(), 'x', { replyToId: 'nope' })).status).toBe(404);
  });

  it('edit and delete own messages only; deleted ones keep their place, lose text', async () => {
    const own = await body(send(christian, 'general', 'Messaggio con refuso'));
    expect(
      (
        await call(`/api/chat/messages/${own.id}`, {
          method: 'PATCH',
          jar: valerio,
          json: { body: 'hack' },
        })
      ).status,
    ).toBe(403);
    const edited = await body(
      call(`/api/chat/messages/${own.id}`, {
        method: 'PATCH',
        jar: christian,
        json: { body: 'Messaggio corretto' },
      }),
    );
    expect(edited).toMatchObject({ body: 'Messaggio corretto', edited: true });
    const deleted = await body(
      call(`/api/chat/messages/${own.id}`, { method: 'DELETE', jar: christian }),
    );
    expect(deleted).toMatchObject({ body: '', deleted: true });
    expect(
      (
        await call(`/api/chat/messages/${own.id}`, {
          method: 'PATCH',
          jar: christian,
          json: { body: 'resurrect' },
        })
      ).status,
    ).toBe(403);
  });

  it('reactions toggle, only emoji; pins list', async () => {
    const msg = await body(send(valerio, 'general', 'Rilasciamo venerdì'));
    let view = await body(
      call(`/api/chat/messages/${msg.id}/reactions`, {
        method: 'POST',
        jar: christian,
        json: { emoji: '🎉' },
      }),
    );
    await call(`/api/chat/messages/${msg.id}/reactions`, {
      method: 'POST',
      jar: sara,
      json: { emoji: '🎉' },
    });
    view = await body(
      call(`/api/chat/messages/${msg.id}/reactions`, {
        method: 'POST',
        jar: sara,
        json: { emoji: '👍🏽' },
      }),
    );
    expect(view.reactions).toEqual([
      expect.objectContaining({ emoji: '🎉', count: 2, mine: true }),
      expect.objectContaining({ emoji: '👍🏽', count: 1, mine: true }),
    ]);
    view = await body(
      call(`/api/chat/messages/${msg.id}/reactions`, {
        method: 'POST',
        jar: sara,
        json: { emoji: '🎉' },
      }),
    );
    expect(view.reactions[0]).toMatchObject({ emoji: '🎉', count: 1, mine: false });
    expect(
      (
        await call(`/api/chat/messages/${msg.id}/reactions`, {
          method: 'POST',
          jar: sara,
          json: { emoji: '<b>x</b>' },
        })
      ).status,
    ).toBe(400);
    await call(`/api/chat/messages/${msg.id}/pin`, { method: 'PUT', jar: christian });
    const pins = await body(call('/api/chat/rooms/general/pins', { jar: sara }));
    expect(pins.messages.map((m: Message) => m.body)).toEqual(['Rilasciamo venerdì']);
  });

  it('unread counts others’ messages after the last read; mute is per user', async () => {
    let rooms = (await body(call('/api/chat/rooms', { jar: sara }))).rooms;
    const general = rooms.find((r: { id: string }) => r.id === 'general');
    expect(general.unread).toBeGreaterThan(0);
    expect(rooms.some((r: { id: string }) => r.id === projectRoom())).toBe(false);
    const { messages } = await list(sara, 'general');
    await call('/api/chat/rooms/general/read', {
      method: 'POST',
      jar: sara,
      json: { seq: messages.at(-1)?.seq },
    });
    await call('/api/chat/rooms/general/mute', { method: 'PUT', jar: sara });
    rooms = (await body(call('/api/chat/rooms', { jar: sara }))).rooms;
    expect(rooms.find((r: { id: string }) => r.id === 'general')).toMatchObject({
      unread: 0,
      muted: true,
    });
    const valerioRooms = (await body(call('/api/chat/rooms', { jar: valerio }))).rooms;
    expect(valerioRooms[0].id).toBe('general');
    expect(valerioRooms.find((r: { id: string }) => r.id === 'general').muted).toBe(false);
    expect(valerioRooms.some((r: { id: string }) => r.id === projectRoom())).toBe(true);
  });

  it('discussions and task comments; comment count on the card', async () => {
    const { id } = await body(
      call(`/api/projects/${projectId}/threads`, {
        method: 'POST',
        jar: christian,
        json: { title: 'Architettura' },
      }),
    );
    await send(christian, id, 'Proposta: D1 per tutto');
    const rooms = (await body(call('/api/chat/rooms', { jar: valerio }))).rooms;
    expect(rooms.find((r: { id: string }) => r.id === id)).toMatchObject({
      kind: 'thread',
      title: 'Architettura',
    });
    await send(valerio, `task:${taskId}`, 'Inizio io');
    await send(christian, `task:${taskId}`, 'Ok');
    const tasks = await body(call(`/api/projects/${projectId}/tasks`, { jar: valerio }));
    expect(tasks.files[0].tasks[0].comments).toBe(2);
    expect((await call(`/api/chat/rooms/task:${taskId}/messages`, { jar: sara })).status).toBe(404);
    expect(
      (
        await call('/api/chat/rooms/thread:00000000-0000-0000-0000-000000000000/messages', {
          jar: valerio,
        })
      ).status,
    ).toBe(404);
  });

  it('viewers can comment on tasks only if the owner allows it', async () => {
    await call(`/api/projects/${projectId}/members/${christianId}`, {
      method: 'PATCH',
      jar: valerio,
      json: { role: 'viewer' },
    });
    expect((await send(christian, `task:${taskId}`, 'posso?')).status).toBe(403);
    expect((await send(christian, projectRoom(), 'posso?')).status).toBe(403);
    await call(`/api/projects/${projectId}`, {
      method: 'PATCH',
      jar: valerio,
      json: { viewersCanComment: true },
    });
    expect((await send(christian, `task:${taskId}`, 'ora sì')).status).toBe(201);
    expect((await send(christian, projectRoom(), 'chat no')).status).toBe(403);
    await call(`/api/projects/${projectId}/members/${christianId}`, {
      method: 'PATCH',
      jar: valerio,
      json: { role: 'member' },
    });
  });

  it('searches only rooms the user can read, ignoring accents, never deleted messages', async () => {
    await send(valerio, projectRoom(), 'Perché la CI è rossa?');
    const mine = await body(call('/api/chat/search?q=perche ci', { jar: valerio }));
    expect(mine.messages.map((m: Message) => m.body)).toContain('Perché la CI è rossa?');
    const hers = await body(call('/api/chat/search?q=perche', { jar: sara }));
    expect(hers.messages).toEqual([]);
    expect((await body(call('/api/chat/search?q=refuso', { jar: valerio }))).messages).toEqual([]);
    // Query syntax is not injectable.
    expect((await call('/api/chat/search?q=" OR NEAR(*', { jar: valerio })).status).toBe(200);
  });

  it('attachments: type and size checked, served only to people in the room, linked on send', async () => {
    const bytes = new TextEncoder().encode('console.log("ciao")');
    const up = await call(
      `/api/chat/rooms/${projectRoom()}/attachments?name=${encodeURIComponent('../script.ts')}`,
      {
        method: 'PUT',
        jar: valerio,
        body: bytes,
        headers: {
          'content-type': 'video/mp2t',
          'content-length': String(bytes.length),
          origin: ORIGIN,
        },
      },
    );
    expect(up.status).toBe(201);
    const file = (await up.json()) as { id: string; name: string; mime: string };
    expect(file).toMatchObject({ name: 'script.ts', mime: 'text/plain' });
    // Not sent yet: invisible to others.
    expect((await call(`/api/files/chat/${file.id}`, { jar: christian })).status).toBe(404);
    const msg = await body(send(valerio, projectRoom(), '', { attachmentIds: [file.id] }));
    expect(msg.attachments).toEqual([expect.objectContaining({ id: file.id, name: 'script.ts' })]);
    const download = await call(`/api/files/chat/${file.id}`, { jar: christian });
    expect(download.status).toBe(200);
    expect(download.headers.get('x-content-type-options')).toBe('nosniff');
    expect(download.headers.get('content-disposition')).toContain('attachment');
    expect(await download.text()).toBe('console.log("ciao")');
    expect((await call(`/api/files/chat/${file.id}`, { jar: sara })).status).toBe(404);
    // Someone else's pending file can't be attached.
    const other = await call(`/api/chat/rooms/${projectRoom()}/attachments?name=a.txt`, {
      method: 'PUT',
      jar: christian,
      body: bytes,
      headers: {
        'content-type': 'text/plain',
        'content-length': String(bytes.length),
        origin: ORIGIN,
      },
    });
    const otherFile = (await other.json()) as { id: string };
    expect(
      (await send(valerio, projectRoom(), 'rubo', { attachmentIds: [otherFile.id] })).status,
    ).toBe(400);
    const html = await call(`/api/chat/rooms/${projectRoom()}/attachments?name=x.svg`, {
      method: 'PUT',
      jar: valerio,
      body: bytes,
      headers: {
        'content-type': 'image/svg+xml',
        'content-length': String(bytes.length),
        origin: ORIGIN,
      },
    });
    expect(html.status).toBe(415);
    const big = await call(`/api/chat/rooms/${projectRoom()}/attachments?name=big.zip`, {
      method: 'PUT',
      jar: valerio,
      body: bytes,
      headers: {
        'content-type': 'application/zip',
        'content-length': String(11 * 1024 * 1024),
        origin: ORIGIN,
      },
    });
    expect(big.status).toBe(413);
  });

  it('link previews only for Kyon pages the user can see and GitHub repos visible to them', async () => {
    const kyon = await body(
      call(`/api/chat/preview?url=${encodeURIComponent(`${ORIGIN}/progetti?id=${projectId}`)}`, {
        jar: valerio,
      }),
    );
    expect(kyon.preview).toMatchObject({ title: 'Chat', subtitle: 'Progetto Kyon' });
    const hidden = await body(
      call(`/api/chat/preview?url=${encodeURIComponent(`${ORIGIN}/progetti?id=${projectId}`)}`, {
        jar: sara,
      }),
    );
    expect(hidden.preview).toBeNull();
    expect(
      (
        await call(
          `/api/chat/preview?url=${encodeURIComponent('http://169.254.169.254/latest/meta-data')}`,
          { jar: valerio },
        )
      ).status,
    ).toBe(400);
    const gh = await body(
      call(
        `/api/chat/preview?url=${encodeURIComponent('https://github.com/someone/secret/pull/1')}`,
        { jar: valerio },
      ),
    );
    expect(gh.preview).toBeNull();
  });
});

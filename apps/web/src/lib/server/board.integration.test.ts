import { afterAll, beforeAll, describe, expect, it, vi } from 'vitest';
import { verifyTicket } from '@kyon/core';
import type { CookieJar } from '@/test/d1';
import { createTestD1, testEnv } from '@/test/d1';
import { createFakeGitHub, installFakeFetch } from '@/test/fakeGithub';
import { connectGitHub, fakeRepo, projectFromRepo, repoFiles } from '@/test/github';
import { body, call, inviteAndJoin, joinAs } from '@/test/http';

let env: CloudflareEnv;
vi.mock('@/lib/server/env', () => ({ getEnv: async () => env }));

const fake = createFakeGitHub();
type Task = {
  id: string;
  text: string;
  done: boolean;
  columnId: string;
  position: number;
  priority: string;
  dueDate: string | null;
  assignee: { id: string; name: string } | null;
  labels: { id: string; name: string }[];
  notesKyon: string | null;
};
type Column = { id: string; name: string; isDone: boolean; isInProgress: boolean };
type TasksResponse = {
  columns: Column[];
  labels: { id: string; name: string; color: string }[];
  files: { path: string; tasks: Task[] }[];
};

const all = (r: TasksResponse) => r.files.flatMap((f) => f.tasks);
const find = (r: TasksResponse, text: string) => all(r).find((t) => t.text === text);
const inColumn = (r: TasksResponse, columnId: string) =>
  all(r)
    .filter((t) => t.columnId === columnId)
    .sort((a, b) => a.position - b.position)
    .map((t) => t.text);

describe('board metadata: assignee, priority, due date, labels, columns, history', () => {
  let dispose: () => Promise<void>;
  let restore: () => void;
  let valerio: CookieJar;
  let christian: CookieJar;
  let christianId: string;
  let projectId: string;
  let repoId: number;
  let tasks: TasksResponse;
  const col = (name: string) => tasks.columns.find((c) => c.name === name) as Column;
  const patch = (jar: CookieJar, taskId: string, json: unknown) =>
    call(`/api/projects/${projectId}/tasks/${taskId}`, { method: 'PATCH', jar, json });

  beforeAll(async () => {
    const d1 = await createTestD1();
    dispose = d1.dispose;
    env = testEnv(d1.db, { ADMIN_BOOTSTRAP_CODE: 'bootstrap-code-for-tests' });
    restore = installFakeFetch(fake);
    valerio = await joinAs('bootstrap-code-for-tests', 'Valerio', 'valerio@kyon.test');
    christian = await inviteAndJoin(valerio, 'Christian', 'christian@kyon.test');
    christianId = (await body(call('/api/me', { jar: christian }))).id;
    repoId = await fakeRepo(fake, 'valerio-board', 'board', {
      'TASKS.md': '# Task\n\n## Da fare\n\n- [ ] Uno\n- [ ] Due\n- [ ] Tre\n',
    });
    await connectGitHub(valerio, 'valerio-board');
    projectId = await projectFromRepo(valerio, 'valerio-board/board', 'Board');
    tasks = await body(call(`/api/projects/${projectId}/sync`, { method: 'POST', jar: valerio }));
  });
  afterAll(async () => {
    restore();
    await dispose();
  });

  it('sets assignee (members only), priority, due date and notes without touching the repo', async () => {
    const before = repoFiles(fake, repoId).get('TASKS.md');
    const uno = find(tasks, 'Uno') as Task;
    const sara = await inviteAndJoin(valerio, 'Sara', 'sara@kyon.test');
    const saraId = (await body(call('/api/me', { jar: sara }))).id;
    // Sara can see the repo (group) but isn't a project member.
    expect((await patch(valerio, uno.id, { assigneeId: saraId })).status).toBe(400);
    tasks = await body(
      patch(valerio, uno.id, {
        assigneeId: christianId,
        priority: 'high',
        dueDate: '2026-11-03',
        notes: 'Prima il modello',
      }),
    );
    expect(find(tasks, 'Uno')).toMatchObject({
      assignee: { id: christianId, name: 'Christian' },
      priority: 'high',
      dueDate: '2026-11-03',
      notesKyon: 'Prima il modello',
    });
    expect((await patch(valerio, uno.id, { dueDate: '2026-02-30' })).status).toBe(400);
    expect((await patch(valerio, uno.id, { priority: 'mega' })).status).toBe(400);
    expect(repoFiles(fake, repoId).get('TASKS.md')).toBe(before);
  });

  it('reorders inside a column and moves between non-done columns as metadata only', async () => {
    const before = repoFiles(fake, repoId).get('TASKS.md');
    const tre = find(tasks, 'Tre') as Task;
    tasks = await body(patch(valerio, tre.id, { move: { columnId: col('Da fare').id, index: 0 } }));
    expect(inColumn(tasks, col('Da fare').id)).toEqual(['Tre', 'Uno', 'Due']);
    tasks = await body(
      patch(valerio, tre.id, { move: { columnId: col('In corso').id, index: 0 } }),
    );
    expect(inColumn(tasks, col('In corso').id)).toEqual(['Tre']);
    expect(find(tasks, 'Tre')?.done).toBe(false);
    expect(repoFiles(fake, repoId).get('TASKS.md')).toBe(before);
  });

  it('moving into "Fatto" ticks the task in the repo, moving out unticks it', async () => {
    const due = find(tasks, 'Due') as Task;
    tasks = await body(patch(valerio, due.id, { move: { columnId: col('Fatto').id, index: 0 } }));
    expect(repoFiles(fake, repoId).get('TASKS.md')).toContain('- [x] Due');
    expect(find(tasks, 'Due')).toMatchObject({ done: true, columnId: col('Fatto').id });
    tasks = await body(
      patch(valerio, due.id, { move: { columnId: col('In corso').id, index: 1 } }),
    );
    expect(repoFiles(fake, repoId).get('TASKS.md')).toContain('- [ ] Due');
    expect(find(tasks, 'Due')).toMatchObject({ done: false, columnId: col('In corso').id });
    expect(inColumn(tasks, col('In corso').id)).toEqual(['Tre', 'Due']);
  });

  it('records the history of a task, newest first', async () => {
    const due = find(tasks, 'Due') as Task;
    const history = await body(
      call(`/api/projects/${projectId}/tasks/${due.id}/history`, { jar: christian }),
    );
    const types = history.events.map((e: { type: string }) => e.type);
    expect(types.slice(0, 4)).toEqual([
      'task_moved',
      'task_reopened',
      'task_moved',
      'task_completed',
    ]);
    expect(history.events[0].actor).toMatchObject({ name: 'Valerio' });
    expect(history.createdAt).toBeTruthy();
  });

  it('labels: create (reusing names), assign, rename, delete', async () => {
    const created = await body(
      call(`/api/projects/${projectId}/labels`, {
        method: 'POST',
        jar: christian,
        json: { name: 'Biologia', color: 'mint' },
      }),
    );
    const again = await body(
      call(`/api/projects/${projectId}/labels`, {
        method: 'POST',
        jar: christian,
        json: { name: 'biologia', color: 'red' },
      }),
    );
    expect(again.id).toBe(created.id);
    const bad = await call(`/api/projects/${projectId}/labels`, {
      method: 'POST',
      jar: christian,
      json: { name: 'X', color: '#ff0000' },
    });
    expect(bad.status).toBe(400);
    const uno = find(tasks, 'Uno') as Task;
    tasks = await body(patch(christian, uno.id, { labelIds: [created.id] }));
    expect(find(tasks, 'Uno')?.labels.map((l) => l.name)).toEqual(['Biologia']);
    expect((await patch(christian, uno.id, { labelIds: ['nope'] })).status).toBe(400);
    tasks = await body(
      call(`/api/projects/${projectId}/labels/${created.id}`, {
        method: 'PATCH',
        jar: christian,
        json: { name: 'Bio' },
      }),
    );
    expect(find(tasks, 'Uno')?.labels.map((l) => l.name)).toEqual(['Bio']);
    tasks = await body(
      call(`/api/projects/${projectId}/labels/${created.id}`, { method: 'DELETE', jar: christian }),
    );
    expect(find(tasks, 'Uno')?.labels).toEqual([]);
    expect(tasks.labels).toEqual([]);
  });

  it('columns: owners add (before "Fatto"), rename, reorder, delete; special ones stay', async () => {
    const forbidden = await call(`/api/projects/${projectId}/columns`, {
      method: 'POST',
      jar: christian,
      json: { name: 'Review' },
    });
    expect(forbidden.status).toBe(403);
    tasks = await body(
      call(`/api/projects/${projectId}/columns`, {
        method: 'POST',
        jar: valerio,
        json: { name: 'Review' },
      }),
    );
    expect(tasks.columns.map((c) => c.name)).toEqual(['Da fare', 'In corso', 'Review', 'Fatto']);
    const review = col('Review');
    tasks = await body(
      call(`/api/projects/${projectId}/columns/${review.id}`, {
        method: 'PATCH',
        jar: valerio,
        json: { name: 'Revisione', index: 0 },
      }),
    );
    expect(tasks.columns.map((c) => c.name)).toEqual(['Revisione', 'Da fare', 'In corso', 'Fatto']);
    const uno = find(tasks, 'Uno') as Task;
    tasks = await body(patch(valerio, uno.id, { move: { columnId: review.id, index: 0 } }));
    const doneDelete = await call(`/api/projects/${projectId}/columns/${col('Fatto').id}`, {
      method: 'DELETE',
      jar: valerio,
    });
    expect(doneDelete.status).toBe(400);
    tasks = await body(
      call(`/api/projects/${projectId}/columns/${review.id}`, { method: 'DELETE', jar: valerio }),
    );
    expect(tasks.columns.map((c) => c.name)).toEqual(['Da fare', 'In corso', 'Fatto']);
    expect(find(tasks, 'Uno')?.columnId).toBe(col('Da fare').id);
  });

  it('viewers cannot edit metadata; non-members get 404', async () => {
    await call(`/api/projects/${projectId}/members/${christianId}`, {
      method: 'PATCH',
      jar: valerio,
      json: { role: 'viewer' },
    });
    const uno = find(tasks, 'Uno') as Task;
    expect((await patch(christian, uno.id, { priority: 'low' })).status).toBe(403);
    const stranger = await inviteAndJoin(valerio, 'Marta', 'marta@kyon.test');
    expect((await patch(stranger, uno.id, { priority: 'low' })).status).toBe(404);
    expect(
      (await call(`/api/projects/${projectId}/tasks/${uno.id}/history`, { jar: stranger })).status,
    ).toBe(404);
  });

  it('issues realtime tickets only to members, bound to the project room', async () => {
    const res = await body(call(`/api/realtime/ticket?project=${projectId}`, { jar: christian }));
    expect(res.url).toBe(`/ws/project/${projectId}`);
    const ticket = await verifyTicket(
      env.INTERNAL_SECRET ?? '',
      res.ticket,
      `project:${projectId}`,
    );
    expect(ticket?.userId).toBe(christianId);
    const stranger = await inviteAndJoin(valerio, 'Luca', 'luca@kyon.test');
    expect(
      (await call(`/api/realtime/ticket?project=${projectId}`, { jar: stranger })).status,
    ).toBe(404);
    expect((await call('/api/realtime/ticket?room=general', { jar: stranger })).status).toBe(200);
    expect((await call('/api/realtime/ticket', { jar: stranger })).status).toBe(400);
  });
});

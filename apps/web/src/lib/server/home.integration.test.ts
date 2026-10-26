import { hmacSha256Hex } from '@kyon/core';
import { afterAll, beforeAll, describe, expect, it, vi } from 'vitest';
import type { CookieJar } from '@/test/d1';
import { createTestD1, testEnv } from '@/test/d1';
import { createFakeGitHub, installFakeFetch } from '@/test/fakeGithub';
import { connectGitHub, fakeRepo, projectFromRepo } from '@/test/github';
import { body, call, inviteAndJoin, joinAs } from '@/test/http';

let env: CloudflareEnv;
vi.mock('@/lib/server/env', () => ({ getEnv: async () => env }));

const fake = createFakeGitHub();

describe('home, search, people, activity, calendar', () => {
  let dispose: () => Promise<void>;
  let restore: () => void;
  let valerio: CookieJar;
  let christian: CookieJar;
  let sara: CookieJar;
  let valerioId: string;
  let christianId: string;
  let projectId: string;
  let githubRepoId: number;
  let taskId: string;

  beforeAll(async () => {
    const d1 = await createTestD1();
    dispose = d1.dispose;
    env = testEnv(d1.db, { ADMIN_BOOTSTRAP_CODE: 'bootstrap-code-for-tests', FILES: d1.files });
    restore = installFakeFetch(fake);
    valerio = await joinAs('bootstrap-code-for-tests', 'Valerio', 'valerio@kyon.test');
    christian = await inviteAndJoin(valerio, 'Christian', 'christian@kyon.test');
    valerioId = (await body(call('/api/me', { jar: valerio }))).id;
    christianId = (await body(call('/api/me', { jar: christian }))).id;
    githubRepoId = await fakeRepo(fake, 'valerio-home', 'segreto', {
      'TASKS.md': '# Piano\n\n- [ ] Scrivere il parser\n- [ ] Rilasciare la beta\n',
    });
    await connectGitHub(valerio, 'valerio-home');
    projectId = await projectFromRepo(valerio, 'valerio-home/segreto', 'Progetto Segreto');
    // Sara joins after the project exists: in the group, not in the project.
    sara = await inviteAndJoin(valerio, 'Sara', 'sara@kyon.test');
    const tasks = await body(
      call(`/api/projects/${projectId}/sync`, { method: 'POST', jar: valerio }),
    );
    taskId = tasks.files[0].tasks[0].id;
    await call(`/api/projects/${projectId}/tasks/${taskId}`, {
      method: 'PATCH',
      jar: valerio,
      json: { assigneeId: christianId, dueDate: '2030-01-15' },
    });
    await call(`/api/chat/rooms/task:${taskId}/messages`, {
      method: 'POST',
      jar: valerio,
      json: { clientId: crypto.randomUUID(), body: 'Parto dal lexer' },
    });
  }, 30_000);
  afterAll(async () => {
    restore();
    await dispose();
  });

  it('home shows my tasks, comments and contributions from my projects only', async () => {
    const mine = await body(call('/api/home', { jar: christian }));
    expect(mine.myTasks).toEqual([
      expect.objectContaining({
        id: taskId,
        text: 'Scrivere il parser',
        dueDate: '2030-01-15',
        projectName: 'Progetto Segreto',
      }),
    ]);
    expect(mine.comments[0]).toMatchObject({
      excerpt: 'Parto dal lexer',
      kind: 'task',
      context: 'Scrivere il parser',
      author: { name: 'Valerio' },
    });
    expect(mine.contributions.some((e: { type: string }) => e.type === 'task_assigned')).toBe(true);

    // Not a member: nothing of the project leaks, not even a count.
    const outsider = await body(call('/api/home', { jar: sara }));
    expect(outsider).toMatchObject({ myTasks: [], comments: [], contributions: [], runs: [] });
    expect(JSON.stringify(outsider)).not.toContain('Segreto');
  });

  it('pushes show up as contributions with their commit messages', async () => {
    const payload = JSON.stringify({
      ref: 'refs/heads/main',
      repository: { id: githubRepoId },
      pusher: { name: 'valerio-home' },
      commits: [
        { id: 'a'.repeat(40), message: 'feat: lexer\n\nlong body', url: 'https://github.com/x/1' },
        { id: 'b'.repeat(40), message: 'fix: token', url: 'javascript:alert(1)' },
      ],
    });
    const res = await call('/api/github/webhook', {
      method: 'POST',
      body: payload,
      headers: {
        'x-github-event': 'push',
        'x-hub-signature-256': `sha256=${await hmacSha256Hex('fake-webhook-secret', payload)}`,
      },
    });
    expect(res.status).toBe(200);
    const home = await body(call('/api/home', { jar: christian }));
    const push = home.contributions.find((e: { type: string }) => e.type === 'commits_pushed');
    expect(push.payload).toMatchObject({ count: 2, text: 'fix: token', by: 'valerio-home' });
    expect(push.payload.commits[0]).toMatchObject({ message: 'feat: lexer' });
    expect(push.payload.commits[1].url).toBeNull(); // only github.com links
    expect((await body(call('/api/home', { jar: sara }))).contributions).toEqual([]);
  });

  it('search finds projects, tasks and prompts only where you are a member', async () => {
    const found = await body(call('/api/search?q=parser', { jar: christian }));
    expect(found.tasks.map((t: { text: string }) => t.text)).toEqual(['Scrivere il parser']);
    expect((await body(call('/api/search?q=segreto', { jar: christian }))).projects).toEqual([
      { id: projectId, name: 'Progetto Segreto', archived: false },
    ]);
    // LIKE wildcards are literal.
    expect((await body(call('/api/search?q=%25%25', { jar: christian }))).tasks).toEqual([]);
    const outsider = await body(call('/api/search?q=parser', { jar: sara }));
    expect(outsider).toEqual({ projects: [], tasks: [], prompts: [] });
    expect((await body(call('/api/search?q=segreto', { jar: sara }))).projects).toEqual([]);
  });

  it('profiles show only shared projects and what the viewer may see', async () => {
    const forChristian = await body(call(`/api/people/${valerioId}`, { jar: christian }));
    expect(forChristian).toMatchObject({ name: 'Valerio', admin: true });
    expect(forChristian.projects).toEqual([
      { id: projectId, name: 'Progetto Segreto', archived: false },
    ]);
    expect(forChristian.activity.length).toBeGreaterThan(0);

    const forSara = await body(call(`/api/people/${valerioId}`, { jar: sara }));
    expect(forSara.projects).toEqual([]);
    expect(forSara.activity).toEqual([]);
    expect(forSara.stats).toEqual({ tasksCompleted: 0, runs: 0 });
    // The repo is exposed to the whole group: visible, but not the project.
    expect(forSara.repos.map((r: { fullName: string }) => r.fullName)).toEqual([
      'valerio-home/segreto',
    ]);
    expect((await call('/api/people/nobody', { jar: sara })).status).toBe(404);
    expect((await call(`/api/people/${valerioId}`)).status).toBe(401);
  });

  it('global history: paged, per project, members only', async () => {
    const all = await body(call('/api/activity', { jar: christian }));
    expect(all.events.length).toBeGreaterThan(0);
    expect(all.projects).toEqual([{ id: projectId, name: 'Progetto Segreto' }]);
    const one = await body(call(`/api/activity?project=${projectId}`, { jar: christian }));
    expect(one.events.length).toBe(all.events.length);
    const oldest = all.events.at(-1).createdAt;
    expect((await body(call(`/api/activity?before=${oldest}`, { jar: christian }))).events).toEqual(
      [],
    );
    expect((await body(call('/api/activity', { jar: sara }))).events).toEqual([]);
    expect((await call(`/api/activity?project=${projectId}`, { jar: sara })).status).toBe(404);
    expect((await call('/api/activity?before=ieri', { jar: sara })).status).toBe(400);
  });

  it('calendar feed: secret URL, rotation, revocation, only my projects', async () => {
    expect(await body(call('/api/me/calendar', { jar: christian }))).toEqual({ enabled: false });
    const { url } = await body(call('/api/me/calendar', { method: 'POST', jar: christian }));
    const path = new URL(url).pathname;
    const feed = await call(path);
    expect(feed.status).toBe(200);
    expect(feed.headers.get('content-type')).toContain('text/calendar');
    const text = await feed.text();
    expect(text).toContain('SUMMARY:Progetto Segreto: Scrivere il parser');
    expect(text).toContain('DTSTART;VALUE=DATE:20300115');
    // Someone else's task: not in a personal feed. Unassigned ones are.
    expect(text).not.toContain('Rilasciare la beta');

    const { url: next } = await body(call('/api/me/calendar', { method: 'POST', jar: christian }));
    expect((await call(path)).status).toBe(404);
    expect((await call(new URL(next).pathname)).status).toBe(200);
    await call('/api/me/calendar', { method: 'DELETE', jar: christian });
    expect((await call(new URL(next).pathname)).status).toBe(404);
    expect((await call('/api/calendar/short.ics')).status).toBe(404);

    const { url: saras } = await body(call('/api/me/calendar', { method: 'POST', jar: sara }));
    const empty = await (await call(new URL(saras).pathname)).text();
    expect(empty).not.toContain('VEVENT');
  });

  it('project list shows the last completed task', async () => {
    const before = await body(call('/api/projects', { jar: christian }));
    expect(before.projects[0].lastCompleted).toBeNull();
    const tasks = await body(call(`/api/projects/${projectId}/tasks`, { jar: valerio }));
    const beta = tasks.files[0].tasks.find(
      (t: { text: string }) => t.text === 'Rilasciare la beta',
    );
    const res = await call(`/api/projects/${projectId}/tasks/${beta.id}`, {
      method: 'PATCH',
      jar: valerio,
      json: { done: true },
    });
    expect(res.status).toBe(200);
    const after = await body(call('/api/projects', { jar: christian }));
    expect(after.projects[0].lastCompleted).toMatchObject({
      text: 'Rilasciare la beta',
      by: 'Valerio',
    });
  });

  it('"where you left off" keeps in-app paths only; the tour is remembered', async () => {
    const save = (path: string) =>
      call('/api/me/location', {
        method: 'PUT',
        jar: christian,
        json: { path, title: 'Progetto Segreto' },
      });
    expect((await save(`/progetti?id=${projectId}&tab=prompt`)).status).toBe(200);
    expect((await body(call('/api/home', { jar: christian }))).lastLocation).toMatchObject({
      path: `/progetti?id=${projectId}&tab=prompt`,
      title: 'Progetto Segreto',
    });
    expect((await save('//evil.example')).status).toBe(400);
    expect((await save('/api/me')).status).toBe(400);

    expect((await body(call('/api/me', { jar: christian }))).tourDoneAt).toBeNull();
    await call('/api/me/tour', { method: 'PUT', jar: christian, json: { done: true } });
    expect((await body(call('/api/me', { jar: christian }))).tourDoneAt).toEqual(
      expect.any(String),
    );
  });
});

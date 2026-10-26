import { afterAll, beforeAll, describe, expect, it, vi } from 'vitest';
import { hmacSha256Hex, parseMarkers } from '@kyon/core';
import type { CookieJar } from '@/test/d1';
import { createTestD1, testEnv } from '@/test/d1';
import { createFakeGitHub, installFakeFetch } from '@/test/fakeGithub';
import { FAKE, connectGitHub, fakeRepo, projectFromRepo, repoFiles } from '@/test/github';
import { body, call, inviteAndJoin, joinAs } from '@/test/http';

let env: CloudflareEnv;
vi.mock('@/lib/server/env', () => ({ getEnv: async () => env }));

const fake = createFakeGitHub();

type Task = {
  id: string;
  text: string;
  done: boolean;
  columnId: string;
  run: { id: string; state: string } | null;
};
type TasksResponse = { columns: { id: string; name: string }[]; files: { tasks: Task[] }[] };
type Run = {
  id: string;
  state: string;
  prNumber: number | null;
  linkSource: string | null;
  taskClosedByRun: boolean;
  promptVersion: number | null;
};
type PromptsResponse = {
  prompts: { id: string; body: string; version: number; versionCount: number; status: string }[];
  runs: Run[];
};

/** Delivers a webhook to Kyon the way GitHub would (signed). */
async function deliver(webhook: { event: string; payload: unknown }) {
  const payload = JSON.stringify(webhook.payload);
  const res = await call('/api/github/webhook', {
    method: 'POST',
    body: payload,
    headers: {
      'x-github-event': webhook.event,
      'x-hub-signature-256': `sha256=${await hmacSha256Hex('fake-webhook-secret', payload)}`,
    },
  });
  expect(res.status).toBe(200);
}

async function control(path: string, json: unknown) {
  const res = await fake.app.fetch(
    new Request(`${FAKE}/__fake${path}`, {
      method: 'POST',
      body: JSON.stringify(json),
      headers: { 'content-type': 'application/json' },
    }),
  );
  return res.json() as Promise<{
    number: number;
    headSha: string;
    webhook: { event: string; payload: unknown };
  }>;
}

describe('prompts, runs and PR tracking', () => {
  let dispose: () => Promise<void>;
  let restore: () => void;
  let valerio: CookieJar;
  let christian: CookieJar;
  let projectId: string;
  let repoId: number;
  let promptId: string;
  let runId: string;
  let copied: string;

  const tasks = async () =>
    (await body(call(`/api/projects/${projectId}/tasks`, { jar: valerio }))) as TasksResponse;
  const prompts = async () =>
    (await body(call(`/api/projects/${projectId}/prompts`, { jar: valerio }))) as PromptsResponse;
  const task = async (text: string) =>
    (await tasks()).files.flatMap((f) => f.tasks).find((t) => t.text === text) as Task;
  const run = async (id: string) => (await prompts()).runs.find((r) => r.id === id) as Run;

  beforeAll(async () => {
    const d1 = await createTestD1();
    dispose = d1.dispose;
    env = testEnv(d1.db, { ADMIN_BOOTSTRAP_CODE: 'bootstrap-code-for-tests' });
    restore = installFakeFetch(fake);
    valerio = await joinAs('bootstrap-code-for-tests', 'Valerio', 'valerio@kyon.test');
    christian = await inviteAndJoin(valerio, 'Christian', 'christian@kyon.test');
    repoId = await fakeRepo(fake, 'valerio-runs', 'runs', {
      'TASKS.md':
        '# Task\n\n## Prossimi passi\n\n- [ ] Validare il modello di crescita\n  - [x] Raccogliere i dati\n- [ ] Scrivere la documentazione\n',
    });
    await connectGitHub(valerio, 'valerio-runs');
    projectId = await projectFromRepo(valerio, 'valerio-runs/runs', 'Runs');
    await call(`/api/projects/${projectId}/sync`, { method: 'POST', jar: valerio });
  }, 30_000);
  afterAll(async () => {
    restore();
    await dispose();
  });

  it('creates a prompt with versions; restore adds a version instead of rewriting history', async () => {
    const t = await task('Validare il modello di crescita');
    const created = await body(
      call(`/api/projects/${projectId}/prompts`, {
        method: 'POST',
        jar: valerio,
        json: { taskId: t.id, title: 'Implementa', body: 'Prima versione per {{task}}' },
      }),
    );
    promptId = created.id;
    await call(`/api/prompts/${promptId}`, {
      method: 'PATCH',
      jar: valerio,
      json: { body: 'Seconda: {{task}} in {{file}}' },
    });
    // Same body again: no new version.
    await call(`/api/prompts/${promptId}`, {
      method: 'PATCH',
      jar: valerio,
      json: { body: 'Seconda: {{task}} in {{file}}', status: 'ready' },
    });
    let p = (await prompts()).prompts[0];
    expect(p).toMatchObject({ version: 2, versionCount: 2, status: 'ready' });
    const { versions } = await body(call(`/api/prompts/${promptId}/versions`, { jar: christian }));
    expect(versions.map((v: { number: number }) => v.number)).toEqual([2, 1]);
    await call(`/api/prompts/${promptId}/restore`, {
      method: 'POST',
      jar: valerio,
      json: { versionId: versions[1].id },
    });
    p = (await prompts()).prompts[0];
    expect(p).toMatchObject({ version: 3, versionCount: 3, body: 'Prima versione per {{task}}' });
    await call(`/api/prompts/${promptId}`, {
      method: 'PATCH',
      jar: valerio,
      json: { body: 'Implementa **{{task}}** ({{file}}).' },
    });
  });

  it('copying pins the version, renders the full prompt with the marker and moves the task to "In corso"', async () => {
    const res = await body(call(`/api/prompts/${promptId}/run`, { method: 'POST', jar: valerio }));
    runId = res.run.id;
    copied = res.text;
    expect(parseMarkers(copied)).toEqual([runId]);
    expect(copied).toContain('Implementa **Validare il modello di crescita** (TASKS.md).');
    expect(copied).toContain('CLAUDE.md');
    expect(copied).toContain(`claude/${runId}-validare-il-modello-di-crescita`);
    expect(copied).toContain('  - [x] Raccogliere i dati');
    expect(res.othersActive).toEqual([]);
    expect(res.run).toMatchObject({ state: 'copied', promptVersion: 4 });
    const t = await task('Validare il modello di crescita');
    const columns = (await tasks()).columns;
    expect(t.columnId).toBe(columns.find((c) => c.name === 'In corso')?.id);
    expect(t.run).toMatchObject({ id: runId, state: 'copied' });
    expect((await prompts()).prompts[0]?.status).toBe('used');
    // The exact copied text can be fetched again.
    expect((await body(call(`/api/runs/${runId}/text`, { jar: christian }))).text).toBe(copied);
  });

  it('warns (softly) when someone else already works on the task', async () => {
    const res = await body(
      call(`/api/prompts/${promptId}/run`, { method: 'POST', jar: christian }),
    );
    expect(res.othersActive).toEqual(['Valerio']);
    await call(`/api/runs/${res.run.id}`, {
      method: 'PATCH',
      jar: christian,
      json: { abandoned: true },
    });
    expect((await run(res.run.id)).state).toBe('abandoned');
  });

  it('links the PR from the marker in a commit trailer, then follows CI', async () => {
    const pr = await control(`/repos/${repoId}/pulls`, {
      title: 'Modello di crescita',
      body: 'Senza marcatore nella descrizione',
      head: `claude/${runId}-validare`,
      commits: [`feat: model\n\nKyon-Run: ${runId}`],
    });
    await deliver(pr.webhook);
    expect(await run(runId)).toMatchObject({
      state: 'pr_open',
      prNumber: pr.number,
      linkSource: 'marker',
    });

    const running = await control(`/repos/${repoId}/checks`, {
      pull: pr.number,
      runs: [{ name: 'ci', status: 'in_progress', conclusion: null }],
    });
    await deliver(running.webhook);
    expect((await run(runId)).state).toBe('ci_running');
    const failed = await control(`/repos/${repoId}/checks`, {
      pull: pr.number,
      runs: [{ name: 'ci', status: 'completed', conclusion: 'failure' }],
    });
    await deliver(failed.webhook);
    expect((await run(runId)).state).toBe('ci_failed');
    // New commits, green CI.
    const pushed = await control(`/repos/${repoId}/pulls/${pr.number}`, {
      commits: [`fix: tests\n\nKyon-Run: ${runId}`],
    });
    await deliver(pushed.webhook);
    const passed = await control(`/repos/${repoId}/checks`, {
      pull: pr.number,
      runs: [{ name: 'ci', status: 'completed', conclusion: 'success' }],
    });
    await deliver(passed.webhook);
    expect((await run(runId)).state).toBe('ci_passed');
  });

  it('merge closes the task in the repo; "Annulla chiusura" reopens it with an inverse commit', async () => {
    const pr = (await run(runId)).prNumber;
    const merged = await control(`/repos/${repoId}/pulls/${pr}`, { action: 'merge' });
    await deliver(merged.webhook);
    expect(await run(runId)).toMatchObject({ state: 'merged', taskClosedByRun: true });
    expect(repoFiles(fake, repoId).get('TASKS.md')).toContain(
      '- [x] Validare il modello di crescita',
    );
    expect((await task('Validare il modello di crescita')).done).toBe(true);
    // Redelivery is harmless (no second commit).
    const commits = fake.state.repos.find((r) => r.id === repoId)?.commits?.length;
    await deliver(merged.webhook);
    expect(fake.state.repos.find((r) => r.id === repoId)?.commits?.length).toBe(commits);

    await call(`/api/runs/${runId}/undo-close`, { method: 'POST', jar: valerio });
    expect(repoFiles(fake, repoId).get('TASKS.md')).toContain(
      '- [ ] Validare il modello di crescita',
    );
    const t = await task('Validare il modello di crescita');
    expect(t.done).toBe(false);
    expect(t.columnId).toBe((await tasks()).columns.find((c) => c.name === 'In corso')?.id);
    expect(await run(runId)).toMatchObject({ state: 'merged', taskClosedByRun: false });
    const history = await body(
      call(`/api/projects/${projectId}/tasks/${t.id}/history`, { jar: valerio }),
    );
    expect(history.events.map((e: { type: string }) => e.type)).toEqual(
      expect.arrayContaining([
        'run_started',
        'run_linked',
        'run_merged',
        'run_task_closed',
        'run_task_reopened',
      ]),
    );
  });

  it('without marker: suggests the likely PR, links it on confirmation; manual link and verify too', async () => {
    const t = await task('Scrivere la documentazione');
    const { id } = await body(
      call(`/api/projects/${projectId}/prompts`, {
        method: 'POST',
        jar: valerio,
        json: { taskId: t.id, title: 'Doc', body: 'Scrivi la doc' },
      }),
    );
    const started = await body(call(`/api/prompts/${id}/run`, { method: 'POST', jar: valerio }));
    const docRun = started.run.id as string;
    // A PR without marker, plausible by branch and title; plus an unrelated one.
    await control(`/repos/${repoId}/pulls`, { title: 'Aggiorna dipendenze', head: 'chore/deps' });
    const pr = await control(`/repos/${repoId}/pulls`, {
      title: 'Scrivere la documentazione del modello',
      head: 'docs/scrivere-documentazione',
      author: 'valerio-runs',
    });
    await deliver(pr.webhook);
    expect((await run(docRun)).prNumber).toBeNull();
    const { suggestion } = await body(call(`/api/runs/${docRun}/suggestion`, { jar: valerio }));
    expect(suggestion).toMatchObject({ number: pr.number });
    await call(`/api/runs/${docRun}/link`, {
      method: 'POST',
      jar: valerio,
      json: { prNumber: pr.number, source: 'suggested' },
    });
    expect(await run(docRun)).toMatchObject({
      prNumber: pr.number,
      linkSource: 'suggested',
      state: 'pr_open',
    });

    // Closed without merge: the run says so, the task stays where it is (not done).
    const closed = await control(`/repos/${repoId}/pulls/${pr.number}`, { action: 'close' });
    await deliver(closed.webhook);
    expect((await run(docRun)).state).toBe('closed');
    expect((await task('Scrivere la documentazione')).done).toBe(false);

    // "Verifica stato PR" after a lost webhook (reopened on GitHub, Kyon never heard of it).
    await control(`/repos/${repoId}/pulls/${pr.number}`, { action: 'reopen' });
    expect(
      (await body(call(`/api/runs/${docRun}/verify`, { method: 'POST', jar: valerio }))).found,
    ).toBe(true);
    expect((await run(docRun)).state).toBe('pr_open');

    const bad = await call(`/api/runs/${docRun}/link`, {
      method: 'POST',
      jar: valerio,
      json: { prNumber: 999, source: 'manual' },
    });
    expect(bad.status).toBe(400);
  });

  it('templates: built-ins for everyone, personal ones private, group ones admin-only', async () => {
    const list = await body(call(`/api/templates?project=${projectId}`, { jar: christian }));
    expect(list.templates.filter((t: { scope: string }) => t.scope === 'builtin')).toHaveLength(4);
    const mine = await call('/api/templates', {
      method: 'POST',
      jar: christian,
      json: { scope: 'user', name: 'Mio', body: 'x' },
    });
    expect(mine.status).toBe(201);
    const group = await call('/api/templates', {
      method: 'POST',
      jar: christian,
      json: { scope: 'group', name: 'Gruppo', body: 'x' },
    });
    expect(group.status).toBe(403);
    expect(
      (
        await call('/api/templates', {
          method: 'POST',
          jar: valerio,
          json: { scope: 'group', name: 'Gruppo', body: 'x' },
        })
      ).status,
    ).toBe(201);
    const valerioView = await body(call(`/api/templates?project=${projectId}`, { jar: valerio }));
    expect(valerioView.templates.map((t: { name: string }) => t.name)).not.toContain('Mio');
    expect(valerioView.templates.map((t: { name: string }) => t.name)).toContain('Gruppo');
  });

  it('admin footer: custom wording, the marker is still added; non-admins cannot change it', async () => {
    expect(
      (
        await call('/api/admin/prompt-footer', {
          method: 'PUT',
          jar: christian,
          json: { footer: 'x' },
        })
      ).status,
    ).toBe(403);
    await call('/api/admin/prompt-footer', {
      method: 'PUT',
      jar: valerio,
      json: { footer: 'Leggi CLAUDE.md. Branch {{branch}}.' },
    });
    const res = await body(call(`/api/prompts/${promptId}/run`, { method: 'POST', jar: valerio }));
    expect(res.text).toContain('Leggi CLAUDE.md. Branch claude/');
    // The custom block forgot the marker: Kyon adds it on its own line anyway.
    expect(parseMarkers(res.text)).toEqual([res.run.id]);
    await call('/api/admin/prompt-footer', { method: 'PUT', jar: valerio, json: { footer: '' } });
  });

  it('status tab and CLAUDE.md: preview, write once with confirmation, never overwrite', async () => {
    await control(`/repos/${repoId}/issues`, { title: 'Bug nel grafico' });
    const status = await body(
      call(`/api/projects/${projectId}/status?fresh=1`, { jar: christian }),
    );
    expect(status.githubError).toBeNull();
    expect(status.github.commits.length).toBeGreaterThan(0);
    expect(status.github.issues.map((i: { title: string }) => i.title)).toEqual([
      'Bug nel grafico',
    ]);
    expect(status.history.length).toBeGreaterThan(0);
    const preview = await body(call(`/api/projects/${projectId}/claude-md`, { jar: valerio }));
    expect(preview.exists).toBe(false);
    expect(preview.markdown).toContain('`TASKS.md`');
    expect(
      (await call(`/api/projects/${projectId}/claude-md`, { method: 'POST', jar: valerio })).status,
    ).toBe(201);
    expect(repoFiles(fake, repoId).get('CLAUDE.md')).toContain('Kyon-Run');
    expect(
      (await call(`/api/projects/${projectId}/claude-md`, { method: 'POST', jar: valerio })).status,
    ).toBe(409);
  });

  it('non-members see nothing', async () => {
    const stranger = await inviteAndJoin(valerio, 'Sara', 'sara@kyon.test');
    expect((await call(`/api/projects/${projectId}/prompts`, { jar: stranger })).status).toBe(404);
    expect((await call(`/api/runs/${runId}/text`, { jar: stranger })).status).toBe(404);
    expect(
      (await call(`/api/prompts/${promptId}/run`, { method: 'POST', jar: stranger })).status,
    ).toBe(404);
    expect((await call(`/api/projects/${projectId}/status`, { jar: stranger })).status).toBe(404);
  });
});

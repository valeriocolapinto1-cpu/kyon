import { afterAll, beforeAll, describe, expect, it, vi } from 'vitest';
import { hmacSha256Hex } from '@kyon/core';
import biohybrid from '../../../../../packages/core/src/tasks/fixtures/biohybrid-prossimi-passi.md?raw';
import type { CookieJar } from '@/test/d1';
import { createTestD1, testEnv } from '@/test/d1';
import { createFakeGitHub, installFakeFetch } from '@/test/fakeGithub';
import {
  FAKE,
  connectGitHub,
  fakeRepo,
  projectFromRepo,
  repoFiles,
  selectChecklistFiles,
} from '@/test/github';
import { body, call, inviteAndJoin, joinAs } from '@/test/http';

let env: CloudflareEnv;
vi.mock('@/lib/server/env', () => ({ getEnv: async () => env }));

const fake = createFakeGitHub();
type Task = {
  id: string;
  text: string;
  done: boolean;
  columnId: string;
  path: string;
  headingPath: string[];
};
type TasksResponse = {
  columns: { id: string; name: string; isDone: boolean }[];
  files: { path: string; kind: string; tasks: Task[]; tables: unknown[] }[];
  orphaned: { text: string }[];
  sync: { lastError: string | null };
};

const allTasks = (r: TasksResponse) => r.files.flatMap((f) => f.tasks);
const byText = (r: TasksResponse, text: string) => allTasks(r).find((t) => t.text === text);

async function pushWebhook(repoId: number) {
  const payload = JSON.stringify({
    ref: 'refs/heads/main',
    repository: { id: repoId },
    commits: [],
  });
  return call('/api/github/webhook', {
    method: 'POST',
    body: payload,
    headers: {
      'x-github-event': 'push',
      'x-hub-signature-256': `sha256=${await hmacSha256Hex('fake-webhook-secret', payload)}`,
    },
  });
}

async function externalEdit(repoId: number, path: string, content: string | null) {
  await fake.app.fetch(
    new Request(`${FAKE}/__fake/repos/${repoId}/files`, {
      method: 'POST',
      body: JSON.stringify({ path, content }),
      headers: { 'content-type': 'application/json' },
    }),
  );
}

describe('task engine against the fake GitHub', () => {
  let dispose: () => Promise<void>;
  let restore: () => void;
  let valerio: CookieJar;
  let christian: CookieJar;
  let projectId: string;
  let repoId: number;
  let tasks: TasksResponse;

  beforeAll(async () => {
    const d1 = await createTestD1();
    dispose = d1.dispose;
    env = testEnv(d1.db, { ADMIN_BOOTSTRAP_CODE: 'bootstrap-code-for-tests' });
    restore = installFakeFetch(fake);
    valerio = await joinAs('bootstrap-code-for-tests', 'Valerio', 'valerio@kyon.test');
    christian = await inviteAndJoin(valerio, 'Christian', 'christian@kyon.test');
    repoId = await fakeRepo(fake, 'valerio-tasks', 'allenamento', {
      'PROSSIMI-PASSI.md': biohybrid,
      'TASKS.md': '# Task\n\n- [ ] Una task semplice\n',
      'docs/archivio/2025.md': '- [ ] vecchia task archiviata\n',
      'node_modules/pkg/README.md': '- [ ] non deve comparire\n',
      'README.md': 'Solo prosa, nessuna task.\n',
      'src/index.ts': 'export {}',
    });
    await connectGitHub(valerio, 'valerio-tasks');
    projectId = await projectFromRepo(valerio, 'valerio-tasks/allenamento', 'Biohybrid');
  });
  afterAll(async () => {
    restore();
    await dispose();
  });

  it('reads tasks from every .md, skipping archive, ignored paths and task-less files', async () => {
    const res = await body(
      call(`/api/projects/${projectId}/sync`, { method: 'POST', jar: valerio }),
    );
    expect(res.result).toMatchObject({ unchanged: false, fetched: 3, pending: 0 });
    tasks = res;
    expect(tasks.files.map((f) => f.path)).toEqual(['PROSSIMI-PASSI.md', 'TASKS.md']);
    expect(allTasks(tasks)).toHaveLength(8);
    expect(tasks.files[0]?.tables).toHaveLength(1);
    expect(tasks.columns.map((c) => c.name)).toEqual(['Da fare', 'In corso', 'Fatto']);
    // Already-done tasks start in "Fatto".
    const done = tasks.columns.find((c) => c.isDone)?.id;
    expect(byText(tasks, 'Query dei carichi per esercizio')?.columnId).toBe(done);
    expect(byText(tasks, 'Componente grafico leggero')?.columnId).not.toBe(done);
  });

  it('uses the tree ETag: a second sync without changes downloads nothing', async () => {
    const before = fake.state.requests.length;
    const res = await body(
      call(`/api/projects/${projectId}/sync`, { method: 'POST', jar: valerio }),
    );
    expect(res.result.unchanged).toBe(true);
    expect(fake.state.requests.slice(before).filter((r) => r.path.includes('/contents/'))).toEqual(
      [],
    );
  });

  it('ticks a checkbox with a one-line commit and moves the card to "Fatto"', async () => {
    const task = byText(tasks, 'Componente grafico leggero');
    const res: TasksResponse = await body(
      call(`/api/projects/${projectId}/tasks/${task?.id}`, {
        method: 'PATCH',
        jar: valerio,
        json: { done: true },
      }),
    );
    const file = repoFiles(fake, repoId).get('PROSSIMI-PASSI.md') ?? '';
    expect(file).toContain('- [x] Componente grafico leggero');
    expect(file.split('\n').filter((l, i) => l !== biohybrid.split('\n')[i])).toEqual([
      '- [x] Componente grafico leggero',
    ]);
    const commit = fake.state.repos.find((r) => r.id === repoId)?.commits?.at(-1);
    expect(commit?.message).toBe('chore(tasks): complete "Componente grafico leggero" via Kyon');
    const updated = byText(res, 'Componente grafico leggero');
    expect(updated?.done).toBe(true);
    expect(updated?.id).toBe(task?.id);
    expect(updated?.columnId).toBe(res.columns.find((c) => c.isDone)?.id);
    tasks = res;
  });

  it('keeps the emoji style for emoji tasks', async () => {
    const task = byText(tasks, 'Classifica settimanale');
    tasks = await body(
      call(`/api/projects/${projectId}/tasks/${task?.id}`, {
        method: 'PATCH',
        jar: valerio,
        json: { done: true },
      }),
    );
    expect(repoFiles(fake, repoId).get('PROSSIMI-PASSI.md')).toContain(
      '2. ✅ Classifica settimanale',
    );
  });

  it('re-applies the change once when someone pushed in between (409)', async () => {
    const current = repoFiles(fake, repoId).get('TASKS.md') ?? '';
    fake.state.conflicts.push({
      path: 'TASKS.md',
      content: `${current}- [ ] Aggiunta da qualcun altro\n`,
      times: 1,
    });
    const task = byText(tasks, 'Una task semplice');
    const res = await call(`/api/projects/${projectId}/tasks/${task?.id}`, {
      method: 'PATCH',
      jar: valerio,
      json: { done: true },
    });
    expect(res.status).toBe(200);
    const file = repoFiles(fake, repoId).get('TASKS.md') ?? '';
    expect(file).toContain('- [x] Una task semplice');
    expect(file).toContain('- [ ] Aggiunta da qualcun altro');
    tasks = await body(res);
  });

  it('gives up with a clear 409 after a second conflict, without losing anything', async () => {
    const current = repoFiles(fake, repoId).get('TASKS.md') ?? '';
    fake.state.conflicts.push({ path: 'TASKS.md', content: `${current}- [ ] Altra 1\n`, times: 2 });
    const task = byText(tasks, 'Una task semplice');
    const res = await call(`/api/projects/${projectId}/tasks/${task?.id}`, {
      method: 'PATCH',
      jar: valerio,
      json: { done: false },
    });
    expect(res.status).toBe(409);
    expect((await body(res)).error.message).toMatch(/Ricarica e riprova/);
  });

  it('follows pushes made on GitHub through the signed webhook', async () => {
    const file = repoFiles(fake, repoId).get('PROSSIMI-PASSI.md') ?? '';
    await externalEdit(
      repoId,
      'PROSSIMI-PASSI.md',
      file
        .replace('- [ ] Vista "ultimi 3 mesi"', '- [x] Vista "ultimi 3 mesi" (fatta)')
        .replace('3. ⚪ Sfide tra clan\n', ''),
    );
    expect((await pushWebhook(repoId)).status).toBe(200);
    const res: TasksResponse = await body(
      call(`/api/projects/${projectId}/tasks`, { jar: valerio }),
    );
    // Edited text, same identity (similarity), now done.
    const vista = byText(res, 'Vista "ultimi 3 mesi" (fatta)');
    expect(vista?.id).toBe(byText(tasks, 'Vista "ultimi 3 mesi"')?.id);
    expect(vista?.done).toBe(true);
    // Removed task → orphan archive.
    expect(res.orphaned.map((o) => o.text)).toContain('Sfide tra clan');
    // New task from the earlier concurrent push shows up too.
    expect(byText(res, 'Aggiunta da qualcun altro')).toBeTruthy();
    tasks = res;
  });

  it('credits a member without GitHub with a Co-authored-by trailer', async () => {
    const task = byText(tasks, 'Asse dei tempi in italiano');
    const res = await call(`/api/projects/${projectId}/tasks/${task?.id}`, {
      method: 'PATCH',
      jar: christian,
      json: { done: true },
    });
    expect(res.status).toBe(200);
    const commit = fake.state.repos.find((r) => r.id === repoId)?.commits?.at(-1);
    expect(commit?.message).toContain('Co-authored-by: Christian <christian@kyon.test>');
  });

  it('adds and renames tasks with minimal edits', async () => {
    const add = await call(`/api/projects/${projectId}/tasks`, {
      method: 'POST',
      jar: valerio,
      json: {
        path: 'PROSSIMI-PASSI.md',
        headingPath: ['Prossimi passi — Biohybrid', '1 · Grafici dei progressi'],
        text: 'Legenda dei colori',
      },
    });
    expect(add.status).toBe(201);
    let res: TasksResponse = await body(add);
    const added = byText(res, 'Legenda dei colori');
    expect(added?.headingPath[1]).toBe('1 · Grafici dei progressi');
    res = await body(
      call(`/api/projects/${projectId}/tasks/${added?.id}`, {
        method: 'PATCH',
        jar: valerio,
        json: { text: 'Legenda dei colori accessibile' },
      }),
    );
    expect(byText(res, 'Legenda dei colori accessibile')?.id).toBe(added?.id);
    expect(repoFiles(fake, repoId).get('PROSSIMI-PASSI.md')).toContain(
      '- [ ] Legenda dei colori accessibile',
    );
  });

  it('refuses writes from viewers and from non-members', async () => {
    const terzo = await inviteAndJoin(valerio, 'Terzo', 'terzo@kyon.test');
    const task = allTasks(tasks)[0];
    expect(
      (
        await call(`/api/projects/${projectId}/tasks/${task?.id}`, {
          method: 'PATCH',
          jar: terzo,
          json: { done: true },
        })
      ).status,
    ).toBe(404);
  });

  it('writes to a dedicated branch and opens a PR in "branch + PR" mode', async () => {
    await call(`/api/projects/${projectId}`, {
      method: 'PATCH',
      jar: valerio,
      json: { commitMode: 'branch_pr' },
    });
    const task = byText(tasks, 'Pagina pubblica del clan');
    const res = await call(`/api/projects/${projectId}/tasks/${task?.id}`, {
      method: 'PATCH',
      jar: valerio,
      json: { done: false },
    });
    expect(res.status).toBe(200);
    expect(repoFiles(fake, repoId, 'kyon/tasks').get('PROSSIMI-PASSI.md')).toContain(
      '1. ⚪ Pagina pubblica del clan',
    );
    expect(repoFiles(fake, repoId).get('PROSSIMI-PASSI.md')).toContain(
      '1. 🟢 Pagina pubblica del clan',
    );
    const pulls = fake.state.repos.find((r) => r.id === repoId)?.pulls ?? [];
    expect(pulls.map((p) => [p.head, p.base, p.state])).toEqual([['kyon/tasks', 'main', 'open']]);
    await call(`/api/projects/${projectId}`, {
      method: 'PATCH',
      jar: valerio,
      json: { commitMode: 'direct' },
    });
  });

  const sync = (): Promise<TasksResponse> =>
    body(call(`/api/projects/${projectId}/sync`, { method: 'POST', jar: valerio }));

  it('does not orphan tasks of files missing from a truncated tree', async () => {
    // Sorts last, so a truncated listing drops it.
    await selectChecklistFiles(valerio, projectId, ['zzz-tail.md']);
    await externalEdit(repoId, 'zzz-tail.md', '- [ ] Task in coda\n');
    expect(byText(await sync(), 'Task in coda')).toBeTruthy();

    fake.state.truncatedTree = true;
    try {
      const res = await sync();
      expect(res.sync.lastError).toBe('tree_truncated');
      expect(byText(res, 'Task in coda')).toBeTruthy();
      expect(res.orphaned.map((o) => o.text)).not.toContain('Task in coda');
    } finally {
      fake.state.truncatedTree = false;
    }

    // A complete listing still removes files that really disappeared.
    await externalEdit(repoId, 'zzz-tail.md', null);
    const res = await sync();
    expect(res.sync.lastError).toBeNull();
    expect(res.orphaned.map((o) => o.text)).toContain('Task in coda');
  });

  it('reads files over 1 MB through the blob API instead of seeing them empty', async () => {
    await selectChecklistFiles(valerio, projectId, ['big.md']);
    await externalEdit(repoId, 'big.md', '- [ ] Task in un file grande\n');
    fake.state.largeFiles.add('big.md');
    try {
      const res = await sync();
      expect(byText(res, 'Task in un file grande')).toBeTruthy();
      expect(res.sync.lastError).toBeNull();
    } finally {
      fake.state.largeFiles.delete('big.md');
    }
  });

  it('keeps the last snapshot of a file it cannot read at all', async () => {
    await selectChecklistFiles(valerio, projectId, ['huge.md']);
    await externalEdit(repoId, 'huge.md', '- [ ] Task in un file enorme\n');
    expect(byText(await sync(), 'Task in un file enorme')).toBeTruthy();

    fake.state.hugeFiles.add('huge.md');
    try {
      await externalEdit(repoId, 'huge.md', '- [ ] Task in un file enorme\n- [ ] Altra\n');
      const res = await sync();
      expect(res.sync.lastError).toBe('file_unreadable:huge.md');
      expect(byText(res, 'Task in un file enorme')).toBeTruthy();
      expect(res.orphaned.map((o) => o.text)).not.toContain('Task in un file enorme');
    } finally {
      fake.state.hugeFiles.delete('huge.md');
    }
  });

  it('proposes TASKS.md only for projects without tasks', async () => {
    expect(
      (await call(`/api/projects/${projectId}/tasks-file`, { method: 'POST', jar: valerio }))
        .status,
    ).toBe(409);
    const emptyRepo = await fakeRepo(fake, 'valerio-tasks-2', 'vuota', {
      'README.md': '# Vuota\n',
    });
    await connectGitHub(valerio, 'valerio-tasks-2');
    const id = await projectFromRepo(valerio, 'valerio-tasks-2/vuota', 'Vuota');
    expect(
      (await body(call(`/api/projects/${id}/sync`, { method: 'POST', jar: valerio }))).files,
    ).toEqual([]);
    const res: TasksResponse = await body(
      call(`/api/projects/${id}/tasks-file`, { method: 'POST', jar: valerio }),
    );
    expect(res.files.map((f) => f.path)).toEqual(['TASKS.md']);
    expect(repoFiles(fake, emptyRepo).get('TASKS.md')).toContain('- [ ] Scrivi qui la prima task');
  });

  it('runs the cron reconciliation only with the internal secret', async () => {
    expect((await call('/api/internal/cron', { method: 'POST' })).status).toBe(404);
    const ok = await call('/api/internal/cron', {
      method: 'POST',
      headers: { 'x-kyon-internal': 'fake-internal-secret' },
    });
    expect(ok.status).toBe(200);
    expect(Object.keys((await body(ok)).results).length).toBeGreaterThan(0);
  });
});

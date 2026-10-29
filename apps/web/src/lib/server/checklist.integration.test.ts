import { afterAll, beforeAll, describe, expect, it, vi } from 'vitest';
import type { CookieJar } from '@/test/d1';
import { createTestD1, testEnv } from '@/test/d1';
import { createFakeGitHub, installFakeFetch } from '@/test/fakeGithub';
import { connectGitHub, fakeRepo, projectFromRepo } from '@/test/github';
import { body, call, inviteAndJoin, joinAs } from '@/test/http';

let env: CloudflareEnv;
vi.mock('@/lib/server/env', () => ({ getEnv: async () => env }));

const fake = createFakeGitHub();
type TasksResponse = {
  checklistFiles: string[] | null;
  files: { path: string; tasks: { id: string; text: string }[] }[];
  orphaned: { text: string }[];
  sync: { lastError: string | null };
};
type MarkdownFiles = {
  files: { path: string; kind: string; tasks: number }[];
  selected: string[] | null;
};

describe('checklist files: the project chooses which .md files are read', () => {
  let dispose: () => Promise<void>;
  let restore: () => void;
  let valerio: CookieJar;
  let christian: CookieJar;
  let projectId: string;

  const sync = async () =>
    (await body(
      call(`/api/projects/${projectId}/sync`, { method: 'POST', jar: valerio }),
    )) as TasksResponse;
  const tasks = async () =>
    (await body(call(`/api/projects/${projectId}/tasks`, { jar: valerio }))) as TasksResponse;
  const choose = (paths: string[], jar = valerio) =>
    call(`/api/projects/${projectId}`, { method: 'PATCH', jar, json: { checklistFiles: paths } });

  beforeAll(async () => {
    const d1 = await createTestD1();
    dispose = d1.dispose;
    env = testEnv(d1.db, { ADMIN_BOOTSTRAP_CODE: 'bootstrap-code-for-tests' });
    restore = installFakeFetch(fake);
    valerio = await joinAs('bootstrap-code-for-tests', 'Valerio', 'valerio@kyon.test');
    christian = await inviteAndJoin(valerio, 'Christian', 'christian@kyon.test');
    await fakeRepo(fake, 'valerio-lists', 'liste', {
      'TASKS.md': "# Task\n\n- [ ] Una task vera\n- [ ] Un'altra task vera\n",
      'docs/IDEE.md': '# Idee\n\n## Elenco\n\n- [ ] Idea sparsa uno\n- [ ] Idea sparsa due\n',
      'docs/archivio/2025.md': '- [ ] vecchia task archiviata\n',
      'node_modules/pkg/README.md': '- [ ] non deve comparire\n',
      'src/index.ts': 'export {}',
    });
    await connectGitHub(valerio, 'valerio-lists');
    // Not chosen yet: this is what a new project looks like.
    projectId = await projectFromRepo(valerio, 'valerio-lists/liste', 'Liste', false);
  }, 30_000);
  afterAll(async () => {
    restore();
    await dispose();
  });

  it('reads nothing until the project chooses its checklist files', async () => {
    const before = fake.state.requests.length;
    const res = await sync();
    expect(res.checklistFiles).toBeNull();
    expect(res.files).toEqual([]);
    expect(res.sync.lastError).toBeNull();
    // The tree was listed (for CLAUDE.md) but no .md was downloaded.
    expect(
      fake.state.requests
        .slice(before)
        .filter((r) => r.path.includes('/contents/') && r.path.endsWith('.md')),
    ).toEqual([]);
  });

  it('lists the .md files to choose from, without ignored paths', async () => {
    const res = (await body(
      call(`/api/projects/${projectId}/markdown-files`, { jar: christian }),
    )) as MarkdownFiles;
    expect(res.selected).toBeNull();
    expect(res.files.map((f) => [f.path, f.kind])).toEqual([
      ['docs/archivio/2025.md', 'archive'],
      ['docs/IDEE.md', 'tasks'],
      ['TASKS.md', 'tasks'],
    ]);
  });

  it('shows only the chosen files, one request per chosen file', async () => {
    expect((await choose(['TASKS.md'])).status).toBe(200);
    const before = fake.state.requests.length;
    const res = await sync();
    expect(res.checklistFiles).toEqual(['TASKS.md']);
    expect(res.files.map((f) => f.path)).toEqual(['TASKS.md']);
    expect(res.files[0]?.tasks.map((t) => t.text)).toEqual(['Una task vera', "Un'altra task vera"]);
    expect(
      fake.state.requests
        .slice(before)
        .filter((r) => r.path.includes('/contents/'))
        .map((r) => r.path),
    ).toHaveLength(1);
  });

  it('choosing another file adds it, with the count of tasks already read', async () => {
    await choose(['TASKS.md', 'docs/IDEE.md']);
    const res = await sync();
    expect(res.files.map((f) => f.path)).toEqual(['TASKS.md', 'docs/IDEE.md']);
    const listed = (await body(
      call(`/api/projects/${projectId}/markdown-files`, { jar: valerio }),
    )) as MarkdownFiles;
    expect(listed.files.find((f) => f.path === 'docs/IDEE.md')?.tasks).toBe(2);
  });

  it('un-choosing hides the file; choosing it again brings the same tasks back', async () => {
    const withIdee = await tasks();
    const idea = withIdee.files.find((f) => f.path === 'docs/IDEE.md')?.tasks[0];
    await choose(['TASKS.md']);
    const hidden = await sync();
    expect(hidden.files.map((f) => f.path)).toEqual(['TASKS.md']);
    // Deselected is not "deleted": nothing shows up in the orphans of the project.
    expect(hidden.orphaned).toEqual([]);
    await choose(['TASKS.md', 'docs/IDEE.md']);
    const back = await sync();
    expect(back.files.find((f) => f.path === 'docs/IDEE.md')?.tasks[0]?.id).toBe(idea?.id);
  });

  it('archive files can be chosen too, and ignored paths never are', async () => {
    await choose(['TASKS.md', 'docs/archivio/2025.md', 'node_modules/pkg/README.md']);
    const res = await sync();
    expect(res.files.map((f) => f.path)).toEqual(['TASKS.md', 'docs/archivio/2025.md']);
  });

  it('only who can change the project settings chooses the files', async () => {
    // Christian is a member, not an owner.
    expect((await choose(['TASKS.md'], christian)).status).toBe(403);
    expect((await tasks()).checklistFiles).toEqual([
      'TASKS.md',
      'docs/archivio/2025.md',
      'node_modules/pkg/README.md',
    ]);
  });

  it('a TASKS.md created by Kyon is chosen by itself', async () => {
    await fakeRepo(fake, 'valerio-vuota', 'vuota', { 'README.md': '# Vuota\n' });
    await connectGitHub(valerio, 'valerio-vuota');
    const id = await projectFromRepo(valerio, 'valerio-vuota/vuota', 'Vuota', false);
    await call(`/api/projects/${id}`, {
      method: 'PATCH',
      jar: valerio,
      json: { checklistFiles: ['README.md'] },
    });
    await call(`/api/projects/${id}/sync`, { method: 'POST', jar: valerio });
    const res = (await body(
      call(`/api/projects/${id}/tasks-file`, { method: 'POST', jar: valerio }),
    )) as TasksResponse;
    expect(res.checklistFiles).toEqual(['README.md', 'TASKS.md']);
    expect(res.files.map((f) => f.path)).toEqual(['TASKS.md']);
  });
});

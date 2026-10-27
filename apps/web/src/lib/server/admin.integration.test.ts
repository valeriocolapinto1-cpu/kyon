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

describe('admin: health and export', () => {
  let dispose: () => Promise<void>;
  let restore: () => void;
  let admin: CookieJar;
  let member: CookieJar;
  let projectId: string;

  beforeAll(async () => {
    const d1 = await createTestD1();
    dispose = d1.dispose;
    env = testEnv(d1.db, { ADMIN_BOOTSTRAP_CODE: 'bootstrap-code-for-tests', FILES: d1.files });
    restore = installFakeFetch(fake);
    admin = await joinAs('bootstrap-code-for-tests', 'Valerio', 'valerio@kyon.test');
    member = await inviteAndJoin(admin, 'Christian', 'christian@kyon.test');
    await fakeRepo(fake, 'valerio-adm', 'pubblico', {
      'TASKS.md': '# T\n\n- [ ] Task esportata\n',
    });
    await connectGitHub(admin, 'valerio-adm');
    projectId = await projectFromRepo(admin, 'valerio-adm/pubblico', 'Progetto del gruppo');
    await call(`/api/projects/${projectId}/sync`, { method: 'POST', jar: admin });
    await call('/api/chat/rooms/general/messages', {
      method: 'POST',
      jar: admin,
      json: { clientId: crypto.randomUUID(), body: 'Ciao a tutti' },
    });
    // A project the admin is not in: Christian's own, exposed only to himself.
    await fakeRepo(fake, 'christian-adm', 'privata', { 'TASKS.md': '# T\n\n- [ ] Segreto\n' });
    await connectGitHub(member, 'christian-adm');
    const { repos } = await body(call('/api/repos', { jar: member }));
    const mine = repos.find((r: { fullName: string }) => r.fullName === 'christian-adm/privata');
    await call(`/api/repos/${mine.id}`, {
      method: 'PATCH',
      jar: member,
      json: { exposure: 'self' },
    });
    const created = await body(
      call('/api/projects', {
        method: 'POST',
        jar: member,
        json: { repoId: mine.id, name: 'Progetto privato' },
      }),
    );
    await call(`/api/projects/${created.id}/sync`, { method: 'POST', jar: member });
  }, 30_000);
  afterAll(async () => {
    restore();
    await dispose();
  });

  it('only admins', async () => {
    expect((await call('/api/admin/health', { jar: member })).status).toBe(403);
    expect((await call('/api/admin/export', { jar: member })).status).toBe(403);
    expect((await call('/api/admin/health')).status).toBe(401);
  });

  it('health: config, webhook heartbeat, totals; others’ projects counted, not named', async () => {
    const payload = JSON.stringify({ zen: 'ok' });
    await call('/api/github/webhook', {
      method: 'POST',
      body: payload,
      headers: {
        'x-github-event': 'ping',
        'x-hub-signature-256': `sha256=${await hmacSha256Hex('fake-webhook-secret', payload)}`,
      },
    });
    const health = await body(call('/api/admin/health', { jar: admin }));
    expect(health.config).toMatchObject({ githubApp: true, email: false, push: false });
    expect(health.webhook).toMatchObject({ event: 'ping' });
    expect(health.totals).toMatchObject({ users: 2, projects: 2, messages: 1 });
    const names = health.projects.map((p: { name: string | null }) => p.name);
    expect(names).toContain('Progetto del gruppo');
    expect(names).toContain(null);
    expect(JSON.stringify(health)).not.toContain('Progetto privato');
    expect(JSON.stringify(health)).not.toContain('privata');
  });

  it('export (JSON and Markdown) holds what the admin can see, nothing else', async () => {
    const res = await call('/api/admin/export', { jar: admin });
    expect(res.headers.get('content-disposition')).toMatch(/attachment; filename="kyon-.*\.json"/);
    const data = await body(res);
    expect(data.projects.map((p: { name: string }) => p.name)).toEqual(['Progetto del gruppo']);
    expect(data.projects[0].tasks[0]).toMatchObject({ text: 'Task esportata', column: 'Da fare' });
    expect(data.discussions[0]).toMatchObject({ room: 'Chat del gruppo' });
    expect(JSON.stringify(data)).not.toContain('Segreto');

    const md = await call('/api/admin/export?format=md', { jar: admin });
    expect(md.headers.get('content-type')).toContain('text/markdown');
    const text = await md.text();
    expect(text).toContain('## Progetto del gruppo');
    expect(text).toContain('- [ ] Task esportata · colonna: Da fare');
    expect(text).toContain('**Valerio**');
    expect(text).not.toContain('Segreto');
  });
});

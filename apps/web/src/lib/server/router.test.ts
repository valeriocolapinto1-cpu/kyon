import { describe, expect, it, vi } from 'vitest';

vi.mock('@/lib/server/env', () => ({ getEnv: async () => ({}) }));
const { api } = await import('./router');

describe('api router', () => {
  it('answers unknown paths with a JSON 404', async () => {
    const res = await api.fetch(new Request('http://localhost/api/nope'));
    expect(res.status).toBe(404);
    expect(await res.json()).toEqual({ error: { code: 'not_found', message: 'Non trovato.' } });
  });

  it('routes to handlers with path params', async () => {
    // The handler runs (no DB in this unit test, so it fails inside): anything but the router's 404.
    const res = await api.fetch(
      new Request('http://localhost/api/admin/users/abc/sessions', { method: 'DELETE' }),
    );
    expect(res.status).not.toBe(404);
    expect(
      (
        await api.fetch(
          new Request('http://localhost/api/admin/users/abc/sessions', { method: 'PUT' }),
        )
      ).status,
    ).toBe(404);
  });
});

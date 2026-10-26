import { describe, expect, it } from 'vitest';
import { routeToRoom } from './route';

function fakeNamespace(log: { name: string; url: string; room: string | null }[]) {
  return {
    idFromName: (name: string) => name,
    get: (name: string) => ({
      fetch: async (request: Request) => {
        log.push({ name, url: request.url, room: request.headers.get('x-kyon-room') });
        return new Response('ok');
      },
    }),
  } as unknown as DurableObjectNamespace;
}

describe('routeToRoom', () => {
  it('maps paths to rooms and sets the room header', async () => {
    const log: { name: string; url: string; room: string | null }[] = [];
    const env = { PROJECT_ROOM: fakeNamespace(log), GENERAL_ROOM: fakeNamespace(log) };
    await routeToRoom(new Request('https://x/ws/project/abc-1?ticket=t'), env);
    await routeToRoom(new Request('https://x/ws/general'), env);
    await routeToRoom(new Request('https://x/ws/project/abc-1/broadcast', { method: 'POST' }), env);
    expect(log).toEqual([
      { name: 'project:abc-1', url: 'https://x/connect?ticket=t', room: 'project:abc-1' },
      { name: 'general', url: 'https://x/connect', room: 'general' },
      { name: 'project:abc-1', url: 'https://x/broadcast', room: 'project:abc-1' },
    ]);
  });

  it('ignores other paths and spoofed room headers are overwritten', async () => {
    const log: { name: string; url: string; room: string | null }[] = [];
    const env = { PROJECT_ROOM: fakeNamespace(log), GENERAL_ROOM: fakeNamespace(log) };
    expect(routeToRoom(new Request('https://x/ws/project/a%2Fb'), env)).toBeNull();
    expect(routeToRoom(new Request('https://x/api/me'), env)).toBeNull();
    await routeToRoom(
      new Request('https://x/ws/project/p1', { headers: { 'x-kyon-room': 'general' } }),
      env,
    );
    expect(log[0]?.room).toBe('project:p1');
  });
});

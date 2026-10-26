import { describe, expect, it } from 'vitest';
import { HEARTBEAT_KEY, recordHeartbeat } from './heartbeat';

describe('recordHeartbeat', () => {
  it('upserts the last run timestamp', async () => {
    const calls: unknown[][] = [];
    const db = {
      prepare(query: string) {
        return {
          bind(...args: unknown[]) {
            calls.push([query, ...args]);
            return { run: async () => ({ success: true }) };
          },
        };
      },
    } as unknown as D1Database;

    const now = new Date('2026-10-26T10:00:00.000Z');
    await recordHeartbeat(db, now);

    expect(calls).toHaveLength(1);
    const [query, key, value, ts] = calls[0] ?? [];
    expect(query).toContain('on conflict(key) do update');
    expect(key).toBe(HEARTBEAT_KEY);
    expect(value).toBe('2026-10-26T10:00:00.000Z');
    expect(ts).toBe(now.getTime());
  });
});

describe('triggerReconcile', () => {
  it('calls the web Worker with the shared secret', async () => {
    const { triggerReconcile } = await import('./index');
    const calls: Request[] = [];
    const WEB = {
      fetch: async (input: RequestInfo, init?: RequestInit) => (
        calls.push(new Request(input, init)),
        new Response('{}', { status: 200 })
      ),
    } as unknown as Fetcher;
    expect(await triggerReconcile({ DB: {} as D1Database, WEB, INTERNAL_SECRET: 's3cret' })).toBe(
      'web 200',
    );
    expect(calls[0]?.headers.get('x-kyon-internal')).toBe('s3cret');
    expect(await triggerReconcile({ DB: {} as D1Database, WEB })).toMatch(/skipped/);
  });
});

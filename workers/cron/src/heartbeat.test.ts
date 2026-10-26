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

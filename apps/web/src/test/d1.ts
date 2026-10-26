import { readdirSync, readFileSync } from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { getPlatformProxy } from 'wrangler';

const here = path.dirname(fileURLToPath(import.meta.url));
const migrationsDir = path.resolve(here, '..', 'db', 'migrations');
const wranglerConfig = path.resolve(here, '..', '..', 'wrangler.jsonc');

/** A fresh in-memory D1 (real SQLite semantics via workerd) with every migration applied. */
export async function createTestD1(): Promise<{ db: D1Database; dispose: () => Promise<void> }> {
  // Same bindings as the real Worker, in memory (persist: false).
  const proxy = await getPlatformProxy<CloudflareEnv>({
    configPath: wranglerConfig,
    persist: false,
  });
  const db = proxy.env.DB;
  const files = readdirSync(migrationsDir)
    .filter((f) => f.endsWith('.sql'))
    .sort();
  for (const file of files) {
    const sql = readFileSync(path.join(migrationsDir, file), 'utf8');
    for (const statement of sql.split('--> statement-breakpoint')) {
      const trimmed = statement.trim();
      if (trimmed) await db.prepare(trimmed).run();
    }
  }
  return { db, dispose: () => proxy.dispose() };
}

/** In-memory rate limiter with the same interface as the Workers binding. */
export function fakeLimiter(limit = 1000): RateLimit {
  const counts = new Map<string, number>();
  return {
    async limit({ key }: { key: string }) {
      const next = (counts.get(key) ?? 0) + 1;
      counts.set(key, next);
      return { success: next <= limit };
    },
  } as RateLimit;
}

export function testEnv(db: D1Database, overrides: Partial<CloudflareEnv> = {}): CloudflareEnv {
  return {
    DB: db,
    BETTER_AUTH_SECRET: 'test-secret-test-secret-test-secret-123',
    KYON_ENV: 'development',
    AUTH_LIMITER: fakeLimiter(),
    WRITE_LIMITER: fakeLimiter(),
    FILES: undefined as unknown as R2Bucket,
    KV: undefined as unknown as KVNamespace,
    ASSETS: undefined as unknown as Fetcher,
    WORKER_SELF_REFERENCE: undefined as unknown as Fetcher,
    PROJECT_ROOM: undefined as unknown as DurableObjectNamespace,
    GENERAL_ROOM: undefined as unknown as DurableObjectNamespace,
    ...overrides,
  };
}

/** Keeps cookies between requests, like a browser would. */
export class CookieJar {
  private cookies = new Map<string, string>();
  store(response: Response) {
    for (const header of response.headers.getSetCookie()) {
      const [pair, ...attrs] = header.split(';');
      const [name, ...value] = (pair ?? '').split('=');
      if (!name) continue;
      const expired = attrs.some((a) => /max-age=0/i.test(a.trim()));
      if (expired) this.cookies.delete(name.trim());
      else this.cookies.set(name.trim(), value.join('='));
    }
  }
  header(): string {
    return [...this.cookies].map(([k, v]) => `${k}=${v}`).join('; ');
  }
  clear() {
    this.cookies.clear();
  }
}

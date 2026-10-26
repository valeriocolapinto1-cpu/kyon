// Bindings declared in wrangler.jsonc. Kept by hand (not generated) so typecheck works without wrangler.
declare global {
  interface CloudflareEnv {
    ASSETS: Fetcher;
    WORKER_SELF_REFERENCE: Fetcher;
    DB: D1Database;
    KV: KVNamespace;
    FILES: R2Bucket;
    PROJECT_ROOM: DurableObjectNamespace;
    GENERAL_ROOM: DurableObjectNamespace;
    /** "production" on Cloudflare (set by scripts/deploy.ts), "development" locally. */
    KYON_ENV: 'development' | 'production';
  }
}

export {};

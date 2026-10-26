import { recordHeartbeat } from './heartbeat';

export interface CronEnv {
  DB: D1Database;
  /** Service binding to kyon-web, which owns the GitHub and task logic. */
  WEB: Fetcher;
  INTERNAL_SECRET?: string;
}

/** Asks the web Worker to reconcile a few projects (missed webhooks, pending files, old orphans). */
export async function triggerReconcile(env: CronEnv): Promise<string> {
  if (!env.INTERNAL_SECRET) return 'skipped: no INTERNAL_SECRET';
  try {
    const res = await env.WEB.fetch('https://kyon-web/api/internal/cron', {
      method: 'POST',
      headers: { 'x-kyon-internal': env.INTERNAL_SECRET },
    });
    return `web ${res.status}`;
  } catch (error) {
    // Locally the web app runs under `next dev`, outside the service binding.
    console.warn('Reconcile call failed', error);
    return 'failed';
  }
}

export default {
  async scheduled(controller, env, ctx) {
    ctx.waitUntil(
      Promise.all([
        recordHeartbeat(env.DB, new Date(controller.scheduledTime)),
        triggerReconcile(env).then((r) => console.log('reconcile:', r)),
      ]),
    );
  },
} satisfies ExportedHandler<CronEnv>;

import { getCloudflareContext } from '@opennextjs/cloudflare';

/**
 * Runs work after the response (push, email) inside a request; outside one (tests, scripts)
 * it simply waits, so results stay deterministic.
 */
export async function background(work: Promise<unknown>): Promise<void> {
  let ctx: { waitUntil(promise: Promise<unknown>): void } | null = null;
  try {
    ctx = getCloudflareContext().ctx;
  } catch (error) {
    if (!(error instanceof Error)) throw error;
  }
  if (ctx) ctx.waitUntil(work);
  else await work;
}

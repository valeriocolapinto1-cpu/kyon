import { deriveClientKey, normalizeEmail } from '@kyon/core';
import { api } from '@/lib/server/router';
import { CookieJar } from './d1';

export const ORIGIN = 'http://localhost:8787';
const FAST = 1000; // client-side iterations, low for test speed

export const key = (email: string, password: string) => deriveClientKey(email, password, FAST);

export function req(path: string, init: RequestInit & { jar?: CookieJar } = {}) {
  const headers = new Headers(init.headers);
  if (init.jar) headers.set('cookie', init.jar.header());
  if (init.body && !headers.has('content-type')) headers.set('content-type', 'application/json');
  return new Request(path.startsWith('http') ? path : `${ORIGIN}${path}`, { ...init, headers });
}

/** Calls the real API router (routing + handlers). */
export function call(path: string, init: RequestInit & { jar?: CookieJar; json?: unknown } = {}) {
  const { json, ...rest } = init;
  return api.fetch(req(path, json !== undefined ? { ...rest, body: JSON.stringify(json) } : rest));
}

// Test-only: response bodies are asserted field by field, a precise type adds nothing here.
// eslint-disable-next-line @typescript-eslint/no-explicit-any
export const body = async (res: Response | Promise<Response>): Promise<any> => (await res).json();

export async function joinAs(code: string, name: string, email: string, password = 'password di prova') {
  const jar = new CookieJar();
  const res = await call('/api/join', { method: 'POST', json: { code, name, email, key: await key(email, password) } });
  if (res.status !== 200) throw new Error(`join failed: ${res.status} ${await res.text()}`);
  jar.store(res);
  return jar;
}

export async function signInAs(email: string, password = 'password di prova') {
  const jar = new CookieJar();
  const res = await call('/api/auth/sign-in/email', {
    method: 'POST',
    json: { email: normalizeEmail(email), password: await key(email, password) },
  });
  jar.store(res);
  return { res, jar };
}

/** Admin creates an invite and a new member joins with it. */
export async function inviteAndJoin(admin: CookieJar, name: string, email: string) {
  const invite = await body(call('/api/admin/invites', { method: 'POST', jar: admin, json: { note: name } }));
  return joinAs(invite.code, name, email);
}

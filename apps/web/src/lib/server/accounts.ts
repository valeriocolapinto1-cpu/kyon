import { and, count, desc, eq, gt, max, sql } from 'drizzle-orm';
import { hashClientKey, normalizeEmail, verifyClientKey } from '@kyon/core';
import type { Db } from '@/db/client';
import { account, session, user, verification } from '@/db/schema';
import { ApiError } from './errors';

const RESET_TTL_MS = 24 * 60 * 60 * 1000;
const TOKEN_ALPHABET = 'abcdefghijkmnopqrstuvwxyzABCDEFGHJKLMNPQRSTUVWXYZ23456789';

function randomToken(length = 32): string {
  const bytes = crypto.getRandomValues(new Uint8Array(length));
  return Array.from(bytes, (b) => TOKEN_ALPHABET[b % TOKEN_ALPHABET.length]).join('');
}

async function credentialAccount(db: Db, userId: string) {
  const [row] = await db
    .select()
    .from(account)
    .where(and(eq(account.userId, userId), eq(account.providerId, 'credential')))
    .limit(1);
  return row;
}

/**
 * Changing the email changes the salt of the client key, so the browser sends both the
 * current key (old email) and the new key (new email).
 */
export async function changeEmail(
  db: Db,
  userId: string,
  currentKey: string,
  newEmail: string,
  newKey: string,
) {
  const credential = await credentialAccount(db, userId);
  if (!credential?.password || !(await verifyClientKey(credential.password, currentKey))) {
    throw new ApiError('bad_request', 'La password attuale non è corretta.');
  }
  const email = normalizeEmail(newEmail);
  const [taken] = await db.select({ id: user.id }).from(user).where(eq(user.email, email)).limit(1);
  if (taken && taken.id !== userId)
    throw new ApiError('conflict', 'Questa email è già usata da un altro account.');
  const now = new Date();
  await db.batch([
    db.update(user).set({ email, updatedAt: now }).where(eq(user.id, userId)),
    db
      .update(account)
      .set({ password: await hashClientKey(newKey), updatedAt: now })
      .where(eq(account.id, credential.id)),
  ]);
}

/**
 * Admin-generated reset link (no email needed). Uses Better Auth's own verification format,
 * so POST /api/auth/reset-password consumes it and revokes the user's sessions.
 */
export async function createResetLink(db: Db, userId: string, origin: string, now = new Date()) {
  const [target] = await db.select({ id: user.id }).from(user).where(eq(user.id, userId)).limit(1);
  if (!target) throw new ApiError('not_found');
  const token = randomToken();
  const expiresAt = new Date(now.getTime() + RESET_TTL_MS);
  await db.insert(verification).values({
    id: crypto.randomUUID(),
    identifier: `reset-password:${token}`,
    value: userId,
    expiresAt,
    createdAt: now,
    updatedAt: now,
  });
  return { url: `${origin}/reset?token=${token}`, expiresAt };
}

/** The reset page needs the email to derive the new client key. */
export async function resetTokenEmail(
  db: Db,
  token: string,
  now = new Date(),
): Promise<string | null> {
  if (!/^[A-Za-z0-9]{16,64}$/.test(token)) return null;
  const [row] = await db
    .select({ email: user.email })
    .from(verification)
    .innerJoin(user, eq(user.id, verification.value))
    .where(
      and(eq(verification.identifier, `reset-password:${token}`), gt(verification.expiresAt, now)),
    )
    .limit(1);
  return row?.email ?? null;
}

export interface AdminUserRow {
  id: string;
  name: string;
  email: string;
  role: 'admin' | 'user';
  createdAt: string;
  activeSessions: number;
  lastSeenAt: string | null;
}

export async function listUsersForAdmin(db: Db, now = new Date()): Promise<AdminUserRow[]> {
  const rows = await db
    .select({
      id: user.id,
      name: user.name,
      email: user.email,
      role: user.role,
      createdAt: user.createdAt,
      activeSessions: sql<number>`count(${session.id})`,
      lastSeenAt: max(session.updatedAt),
    })
    .from(user)
    .leftJoin(session, and(eq(session.userId, user.id), gt(session.expiresAt, now)))
    .groupBy(user.id)
    .orderBy(desc(user.createdAt));
  return rows.map((r) => ({
    id: r.id,
    name: r.name,
    email: r.email,
    role: r.role === 'admin' ? 'admin' : 'user',
    createdAt: r.createdAt.toISOString(),
    activeSessions: Number(r.activeSessions),
    lastSeenAt: r.lastSeenAt ? new Date(r.lastSeenAt).toISOString() : null,
  }));
}

export async function setRole(db: Db, userId: string, role: 'admin' | 'user') {
  if (role === 'user') {
    const [admins] = await db.select({ value: count() }).from(user).where(eq(user.role, 'admin'));
    const [target] = await db
      .select({ role: user.role })
      .from(user)
      .where(eq(user.id, userId))
      .limit(1);
    if (!target) throw new ApiError('not_found');
    if (target.role === 'admin' && (admins?.value ?? 0) <= 1) {
      throw new ApiError('conflict', 'Serve almeno un admin: nomina prima qualcun altro.');
    }
  }
  const updated = await db
    .update(user)
    .set({ role, updatedAt: new Date() })
    .where(eq(user.id, userId))
    .returning({ id: user.id });
  if (updated.length === 0) throw new ApiError('not_found');
}

export async function revokeAllSessions(db: Db, userId: string): Promise<number> {
  const deleted = await db
    .delete(session)
    .where(eq(session.userId, userId))
    .returning({ id: session.id });
  return deleted.length;
}

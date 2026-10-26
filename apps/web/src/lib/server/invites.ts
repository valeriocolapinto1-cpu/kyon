import { and, count, desc, eq, isNull } from 'drizzle-orm';
import {
  INVITE_TTL_MS,
  generateInviteCode,
  hashInviteCode,
  inviteState,
  normalizeInviteCode,
  timingSafeEqual,
  type InviteState,
} from '@kyon/core';
import type { Db } from '@/db/client';
import { invite, user } from '@/db/schema';

export interface InviteSummary {
  id: string;
  note: string | null;
  state: InviteState;
  createdAt: string;
  expiresAt: string;
  usedByName: string | null;
}

export async function createInvite(
  db: Db,
  createdBy: string | null,
  note: string | null,
  now = new Date(),
) {
  const code = generateInviteCode();
  const id = crypto.randomUUID();
  const expiresAt = new Date(now.getTime() + INVITE_TTL_MS);
  await db.insert(invite).values({
    id,
    codeHash: await hashInviteCode(code),
    note,
    createdBy,
    createdAt: now,
    expiresAt,
  });
  return { id, code, expiresAt };
}

export async function listInvites(db: Db, now = new Date()): Promise<InviteSummary[]> {
  const rows = await db
    .select({ invite, usedByName: user.name })
    .from(invite)
    .leftJoin(user, eq(user.id, invite.usedBy))
    .orderBy(desc(invite.createdAt))
    .limit(100);
  return rows.map(({ invite: row, usedByName }) => ({
    id: row.id,
    note: row.note,
    state: inviteState(row, now),
    createdAt: row.createdAt.toISOString(),
    expiresAt: row.expiresAt.toISOString(),
    usedByName: usedByName ?? null,
  }));
}

export async function revokeInvite(db: Db, id: string, now = new Date()): Promise<boolean> {
  const result = await db
    .update(invite)
    .set({ revokedAt: now })
    .where(and(eq(invite.id, id), isNull(invite.usedAt), isNull(invite.revokedAt)))
    .returning({ id: invite.id });
  return result.length > 0;
}

export async function countUsers(db: Db): Promise<number> {
  const [row] = await db.select({ value: count() }).from(user);
  return row?.value ?? 0;
}

function sameSecret(a: string, b: string) {
  const enc = new TextEncoder();
  return timingSafeEqual(enc.encode(a), enc.encode(b));
}

export type InviteCheck =
  { kind: 'invite'; id: string } | { kind: 'bootstrap' } | { kind: 'invalid' };

/**
 * Accepts a regular invite, or the bootstrap code while no account exists yet.
 * Never tells apart "unknown", "used", "revoked" and "expired" to the caller.
 */
export async function checkJoinCode(
  db: Db,
  raw: string,
  bootstrapCode: string | undefined,
  now = new Date(),
): Promise<InviteCheck> {
  if (bootstrapCode && bootstrapCode.length >= 12 && sameSecret(raw.trim(), bootstrapCode)) {
    return (await countUsers(db)) === 0 ? { kind: 'bootstrap' } : { kind: 'invalid' };
  }
  const code = normalizeInviteCode(raw);
  if (!code) return { kind: 'invalid' };
  const [row] = await db
    .select()
    .from(invite)
    .where(eq(invite.codeHash, await hashInviteCode(code)))
    .limit(1);
  if (!row || inviteState(row, now) !== 'valid') return { kind: 'invalid' };
  return { kind: 'invite', id: row.id };
}

/** Atomically marks the invite as used: only one of two concurrent sign-ups can win. */
export async function claimInvite(db: Db, id: string, now = new Date()): Promise<boolean> {
  const result = await db
    .update(invite)
    .set({ usedAt: now })
    .where(and(eq(invite.id, id), isNull(invite.usedAt), isNull(invite.revokedAt)))
    .returning({ id: invite.id, expiresAt: invite.expiresAt });
  const claimed = result[0];
  if (!claimed) return false;
  if (claimed.expiresAt.getTime() <= now.getTime()) {
    await db.update(invite).set({ usedAt: null }).where(eq(invite.id, id));
    return false;
  }
  return true;
}

export async function releaseInvite(db: Db, id: string) {
  await db.update(invite).set({ usedAt: null, usedBy: null }).where(eq(invite.id, id));
}

export async function attachInviteUser(db: Db, id: string, userId: string) {
  await db.update(invite).set({ usedBy: userId }).where(eq(invite.id, id));
}

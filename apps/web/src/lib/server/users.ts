import { eq } from 'drizzle-orm';
import { isAccentId, sanitizePreferences, type Preferences } from '@kyon/core';
import type { Db } from '@/db/client';
import { user } from '@/db/schema';
import { ApiError } from './errors';

export interface Me {
  id: string;
  name: string;
  email: string;
  role: 'admin' | 'user';
  bio: string | null;
  statusText: string | null;
  /** Accent id chosen for the name in chat (null: default color). */
  nameColor: string | null;
  avatarUrl: string | null;
  /** null until the user saves preferences from any device. */
  preferences: Preferences | null;
  homeLayout: unknown;
  /** Null until the welcome tour is finished or skipped. */
  tourDoneAt: string | null;
  createdAt: string;
}

export function avatarUrl(userId: string, avatarKey: string | null): string | null {
  // The key changes on every upload, so it doubles as a cache buster.
  return avatarKey
    ? `/api/files/avatars/${userId}?v=${encodeURIComponent(avatarKey.split('/').pop() ?? '')}`
    : null;
}

function parseJsonColumn(value: string | null): unknown {
  if (!value) return null;
  try {
    return JSON.parse(value);
  } catch (error) {
    console.warn('Invalid JSON column', error);
    return null;
  }
}

export async function getMe(db: Db, id: string): Promise<Me> {
  const [row] = await db.select().from(user).where(eq(user.id, id)).limit(1);
  if (!row) throw new ApiError('unauthorized');
  const prefs = parseJsonColumn(row.preferences);
  return {
    id: row.id,
    name: row.name,
    email: row.email,
    role: row.role === 'admin' ? 'admin' : 'user',
    bio: row.bio,
    statusText: row.statusText,
    nameColor: isAccentId(row.nameColor) ? row.nameColor : null,
    avatarUrl: avatarUrl(row.id, row.avatarKey),
    preferences: prefs ? sanitizePreferences(prefs) : null,
    homeLayout: parseJsonColumn(row.homeLayout),
    tourDoneAt: row.tourDoneAt?.toISOString() ?? null,
    createdAt: row.createdAt.toISOString(),
  };
}

export interface ProfilePatch {
  name?: string;
  bio?: string | null;
  statusText?: string | null;
  nameColor?: string | null;
  preferences?: unknown;
  homeLayout?: unknown;
}

export async function updateMe(db: Db, id: string, patch: ProfilePatch): Promise<void> {
  const values: Partial<typeof user.$inferInsert> = { updatedAt: new Date() };
  if (patch.name !== undefined) values.name = patch.name;
  if (patch.bio !== undefined) values.bio = patch.bio || null;
  if (patch.statusText !== undefined) values.statusText = patch.statusText || null;
  if (patch.nameColor !== undefined)
    values.nameColor = isAccentId(patch.nameColor) ? patch.nameColor : null;
  if (patch.preferences !== undefined)
    values.preferences = JSON.stringify(sanitizePreferences(patch.preferences));
  if (patch.homeLayout !== undefined) values.homeLayout = JSON.stringify(patch.homeLayout);
  await db.update(user).set(values).where(eq(user.id, id));
}

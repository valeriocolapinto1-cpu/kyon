import { sha256Hex } from './encoding';

/** Crockford base32 without I, L, O, U: easy to read aloud and type on a phone. */
const ALPHABET = '0123456789ABCDEFGHJKMNPQRSTVWXYZ';

/** 16 characters (80 bits), shown as XXXX-XXXX-XXXX-XXXX. */
export function generateInviteCode(): string {
  const bytes = crypto.getRandomValues(new Uint8Array(16));
  const chars = Array.from(bytes, (b) => ALPHABET[b % 32]).join('');
  return chars.match(/.{4}/g)?.join('-') ?? chars;
}

/** Accepts lowercase, spaces, missing dashes and the usual look-alikes (O→0, I/L→1). */
export function normalizeInviteCode(input: string): string | null {
  const cleaned = input
    .toUpperCase()
    .replace(/[\s-]/g, '')
    .replace(/O/g, '0')
    .replace(/[IL]/g, '1');
  if (cleaned.length !== 16 || [...cleaned].some((c) => !ALPHABET.includes(c))) return null;
  return cleaned.match(/.{4}/g)?.join('-') ?? null;
}

/** Only this hash is stored: a database leak doesn't expose usable invites. */
export function hashInviteCode(normalized: string): Promise<string> {
  return sha256Hex(`kyon-invite:${normalized}`);
}

export type InviteState = 'valid' | 'used' | 'revoked' | 'expired';

export function inviteState(
  invite: { usedAt: Date | null; revokedAt: Date | null; expiresAt: Date },
  now: Date,
): InviteState {
  if (invite.revokedAt) return 'revoked';
  if (invite.usedAt) return 'used';
  if (invite.expiresAt.getTime() <= now.getTime()) return 'expired';
  return 'valid';
}

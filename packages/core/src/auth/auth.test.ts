import { describe, expect, it } from 'vitest';
import {
  CLIENT_KEY_LENGTH,
  bytesToHex,
  checkPassword,
  deriveClientKey,
  describeUserAgent,
  generateInviteCode,
  hashClientKey,
  hashInviteCode,
  inviteState,
  isClientKey,
  normalizeInviteCode,
  shouldRotateSession,
  timingSafeEqual,
  verifyClientKey,
} from './index';

// Low iteration counts keep the tests fast; the algorithm is the same.
const FAST = 1000;

describe('client key derivation', () => {
  it('is deterministic and bound to the normalized email', async () => {
    const a = await deriveClientKey('Valerio@Example.it ', 'una password lunga', FAST);
    const b = await deriveClientKey('valerio@example.it', 'una password lunga', FAST);
    const c = await deriveClientKey('christian@example.it', 'una password lunga', FAST);
    expect(a).toBe(b);
    expect(a).not.toBe(c);
    expect(a).toHaveLength(CLIENT_KEY_LENGTH);
    expect(isClientKey(a)).toBe(true);
  });

  it('normalizes Unicode so the same password typed differently matches', async () => {
    const composed = await deriveClientKey('a@b.it', 'caffè-con-panna', FAST);
    const decomposed = await deriveClientKey('a@b.it', 'caffè-con-panna', FAST);
    expect(composed).toBe(decomposed);
  });

  it('matches a PBKDF2-SHA256 reference vector', async () => {
    // RFC 7914 §11 vector: P="passwd", S="salt", c=1, dkLen=32 → 55ac046e56e3089fec1691c22544b605...
    const key = await crypto.subtle.importKey(
      'raw',
      new TextEncoder().encode('passwd'),
      'PBKDF2',
      false,
      ['deriveBits'],
    );
    const bits = await crypto.subtle.deriveBits(
      { name: 'PBKDF2', hash: 'SHA-256', salt: new TextEncoder().encode('salt'), iterations: 1 },
      key,
      256,
    );
    expect(bytesToHex(new Uint8Array(bits)).slice(0, 32)).toBe('55ac046e56e3089fec1691c22544b605');
  });
});

describe('server hash of the client key', () => {
  it('verifies the right key and rejects others', async () => {
    const key = await deriveClientKey('a@b.it', 'una password lunga', FAST);
    const other = await deriveClientKey('a@b.it', 'un’altra password', FAST);
    const stored = await hashClientKey(key, FAST);
    expect(stored).toMatch(/^pbkdf2-sha256\$1000\$/);
    expect(await verifyClientKey(stored, key)).toBe(true);
    expect(await verifyClientKey(stored, other)).toBe(false);
  });

  it('uses a random salt per hash', async () => {
    const key = await deriveClientKey('a@b.it', 'una password lunga', FAST);
    expect(await hashClientKey(key, FAST)).not.toBe(await hashClientKey(key, FAST));
  });

  it('refuses raw passwords and malformed hashes', async () => {
    await expect(hashClientKey('password in chiaro')).rejects.toThrow();
    expect(await verifyClientKey('scrypt$whatever', 'a'.repeat(64))).toBe(false);
    expect(await verifyClientKey('pbkdf2-sha256$999999999$AAAA$AAAA', 'a'.repeat(64))).toBe(false);
  });
});

describe('password rules', () => {
  it('requires at least 10 characters', () => {
    expect(checkPassword('corta')).toBe('too_short');
    expect(checkPassword('abbastanza lunga')).toBeNull();
    expect(checkPassword('x'.repeat(201))).toBe('too_long');
  });
});

describe('invite codes', () => {
  it('generates readable 80-bit codes', () => {
    const code = generateInviteCode();
    expect(code).toMatch(/^[0-9A-HJKMNP-TV-Z]{4}(-[0-9A-HJKMNP-TV-Z]{4}){3}$/);
    expect(normalizeInviteCode(code)).toBe(code);
  });

  it('forgives case, spacing and look-alike letters', () => {
    expect(normalizeInviteCode('abcd efgh jkmn pqrs')).toBe('ABCD-EFGH-JKMN-PQRS');
    expect(normalizeInviteCode('oo11-ilil-2222-3333')).toBe('0011-1111-2222-3333');
    expect(normalizeInviteCode('too-short')).toBeNull();
    expect(normalizeInviteCode('UUUU-UUUU-UUUU-UUUU')).toBeNull();
  });

  it('hashes deterministically', async () => {
    expect(await hashInviteCode('ABCD-EFGH-JKMN-PQRS')).toBe(
      await hashInviteCode('ABCD-EFGH-JKMN-PQRS'),
    );
    expect(await hashInviteCode('ABCD-EFGH-JKMN-PQRS')).toHaveLength(64);
  });

  it('computes the invite state', () => {
    const now = new Date('2026-10-26T12:00:00Z');
    const base = { usedAt: null, revokedAt: null, expiresAt: new Date('2026-11-02T12:00:00Z') };
    expect(inviteState(base, now)).toBe('valid');
    expect(inviteState({ ...base, usedAt: now }, now)).toBe('used');
    expect(inviteState({ ...base, revokedAt: now }, now)).toBe('revoked');
    expect(inviteState({ ...base, expiresAt: now }, now)).toBe('expired');
  });
});

describe('sessions', () => {
  it('rotates tokens after a week', () => {
    const created = new Date('2026-10-01T00:00:00Z');
    expect(shouldRotateSession(created, new Date('2026-10-07T23:59:00Z'))).toBe(false);
    expect(shouldRotateSession(created, new Date('2026-10-08T00:00:00Z'))).toBe(true);
  });

  it('describes devices', () => {
    expect(
      describeUserAgent(
        'Mozilla/5.0 (iPhone; CPU iPhone OS 18_0 like Mac OS X) AppleWebKit/605.1.15 Version/18.0 Mobile/15E148 Safari/604.1',
      ),
    ).toBe('iPhone · Safari');
    expect(
      describeUserAgent(
        'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 Chrome/130.0 Safari/537.36 Edg/130.0',
      ),
    ).toBe('Windows · Edge');
    expect(describeUserAgent(null)).toBe('Dispositivo sconosciuto');
  });

  it('compares bytes in constant time', () => {
    expect(timingSafeEqual(new Uint8Array([1, 2]), new Uint8Array([1, 2]))).toBe(true);
    expect(timingSafeEqual(new Uint8Array([1, 2]), new Uint8Array([1, 3]))).toBe(false);
    expect(timingSafeEqual(new Uint8Array([1]), new Uint8Array([1, 0]))).toBe(false);
  });
});

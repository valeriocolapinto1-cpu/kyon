import { bytesToHex, fromBase64, timingSafeEqual, toBase64 } from './encoding';

/**
 * Password hashing in two stages, because Workers on the Free plan get ~10 ms of CPU per request
 * and PBKDF2 at a safe cost takes ~90 ms there (measured, see docs/PROGRESS.md):
 *
 * 1. Client: PBKDF2-SHA256, 600 000 iterations (OWASP 2023), salt bound to the normalized email.
 *    The browser sends only this derived key, never the password.
 * 2. Server: PBKDF2-SHA256 again over the derived key with a random per-user salt, so a leaked
 *    database value cannot be replayed as a login credential.
 *
 * Brute-forcing a leaked hash costs the attacker both stages per guess.
 */

export const CLIENT_KDF_ITERATIONS = 600_000;
export const SERVER_KDF_ITERATIONS = 10_000;
export const PASSWORD_MIN_LENGTH = 10;
export const PASSWORD_MAX_LENGTH = 200;
/** Length of the hex client key the server accepts in place of a password. */
export const CLIENT_KEY_LENGTH = 64;

const encoder = new TextEncoder();

export function normalizeEmail(email: string): string {
  return email.trim().toLowerCase();
}

async function pbkdf2(
  secret: BufferSource,
  salt: BufferSource,
  iterations: number,
): Promise<Uint8Array> {
  const key = await crypto.subtle.importKey('raw', secret, 'PBKDF2', false, ['deriveBits']);
  const bits = await crypto.subtle.deriveBits(
    { name: 'PBKDF2', hash: 'SHA-256', salt, iterations },
    key,
    256,
  );
  return new Uint8Array(bits);
}

export type PasswordProblem = 'too_short' | 'too_long';

export function checkPassword(password: string): PasswordProblem | null {
  const length = [...password].length;
  if (length < PASSWORD_MIN_LENGTH) return 'too_short';
  if (length > PASSWORD_MAX_LENGTH) return 'too_long';
  return null;
}

/** Stage 1 (browser): derives the 64-hex-char key that is sent instead of the password. */
export async function deriveClientKey(
  email: string,
  password: string,
  iterations: number = CLIENT_KDF_ITERATIONS,
): Promise<string> {
  const salt = encoder.encode(`kyon/v1/${normalizeEmail(email)}`);
  return bytesToHex(await pbkdf2(encoder.encode(password.normalize('NFKC')), salt, iterations));
}

export function isClientKey(value: string): boolean {
  return value.length === CLIENT_KEY_LENGTH && /^[0-9a-f]+$/.test(value);
}

/** Stage 2 (server): "pbkdf2-sha256$<iterations>$<salt b64>$<hash b64>". */
export async function hashClientKey(
  clientKey: string,
  iterations: number = SERVER_KDF_ITERATIONS,
): Promise<string> {
  if (!isClientKey(clientKey)) throw new Error('Expected a derived client key');
  const salt = crypto.getRandomValues(new Uint8Array(16));
  const hash = await pbkdf2(encoder.encode(clientKey), salt, iterations);
  return `pbkdf2-sha256$${iterations}$${toBase64(salt)}$${toBase64(hash)}`;
}

export async function verifyClientKey(stored: string, clientKey: string): Promise<boolean> {
  const [scheme, iterations, salt, hash] = stored.split('$');
  if (scheme !== 'pbkdf2-sha256' || !iterations || !salt || !hash || !isClientKey(clientKey))
    return false;
  const count = Number(iterations);
  if (!Number.isInteger(count) || count < 1 || count > 100_000) return false;
  const actual = await pbkdf2(encoder.encode(clientKey), fromBase64(salt), count);
  return timingSafeEqual(actual, fromBase64(hash));
}

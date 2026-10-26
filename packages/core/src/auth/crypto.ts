import { fromBase64, toBase64 } from './encoding';

/**
 * AES-GCM encryption for secrets at rest (GitHub tokens). The key is a Worker secret
 * (32 random bytes, base64). Format: "v1.<iv b64>.<ciphertext b64>".
 */

async function importKey(keyBase64: string): Promise<CryptoKey> {
  const raw = fromBase64(keyBase64);
  if (raw.byteLength !== 32) throw new Error('Encryption key must be 32 bytes (base64)');
  return crypto.subtle.importKey('raw', raw, 'AES-GCM', false, ['encrypt', 'decrypt']);
}

export async function encryptSecret(
  keyBase64: string,
  plaintext: string,
  context: string,
): Promise<string> {
  const key = await importKey(keyBase64);
  const iv = crypto.getRandomValues(new Uint8Array(12));
  // `context` (e.g. the user id) is bound as additional data: a ciphertext can't be moved to another row.
  const data = await crypto.subtle.encrypt(
    { name: 'AES-GCM', iv, additionalData: new TextEncoder().encode(context) },
    key,
    new TextEncoder().encode(plaintext),
  );
  return `v1.${toBase64(iv)}.${toBase64(new Uint8Array(data))}`;
}

export async function decryptSecret(
  keyBase64: string,
  payload: string,
  context: string,
): Promise<string> {
  const [version, iv, data] = payload.split('.');
  if (version !== 'v1' || !iv || !data) throw new Error('Unknown secret format');
  const key = await importKey(keyBase64);
  const plain = await crypto.subtle.decrypt(
    { name: 'AES-GCM', iv: fromBase64(iv), additionalData: new TextEncoder().encode(context) },
    key,
    fromBase64(data),
  );
  return new TextDecoder().decode(plain);
}

/** HMAC-SHA256 hex, for verifying webhook signatures. */
export async function hmacSha256Hex(
  secret: string,
  payload: Uint8Array<ArrayBuffer> | string,
): Promise<string> {
  const key = await crypto.subtle.importKey(
    'raw',
    new TextEncoder().encode(secret),
    { name: 'HMAC', hash: 'SHA-256' },
    false,
    ['sign'],
  );
  const bytes = typeof payload === 'string' ? new TextEncoder().encode(payload) : payload;
  const signature = new Uint8Array(await crypto.subtle.sign('HMAC', key, bytes));
  return Array.from(signature, (b) => b.toString(16).padStart(2, '0')).join('');
}

/** Verifies GitHub's `X-Hub-Signature-256: sha256=<hex>` in constant time. */
export async function verifyGitHubSignature(
  secret: string,
  body: Uint8Array<ArrayBuffer> | string,
  header: string | null,
): Promise<boolean> {
  if (!header?.startsWith('sha256=')) return false;
  const expected = await hmacSha256Hex(secret, body);
  const given = header.slice('sha256='.length);
  if (given.length !== expected.length) return false;
  let diff = 0;
  for (let i = 0; i < expected.length; i++) diff |= expected.charCodeAt(i) ^ given.charCodeAt(i);
  return diff === 0;
}

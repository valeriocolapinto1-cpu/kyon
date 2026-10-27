/**
 * Web Push with WebCrypto only (works in Workers, browsers and Node): message encryption
 * (RFC 8291, aes128gcm from RFC 8188) and VAPID authentication (RFC 8292, ES256 JWT).
 */

export interface PushSubscriptionKeys {
  endpoint: string;
  /** Browser's P-256 public key, uncompressed point (65 bytes), base64url. */
  p256dh: string;
  /** 16 random bytes shared with the browser, base64url. */
  auth: string;
}

export interface VapidKeys {
  /** Uncompressed P-256 point (65 bytes), base64url: also the browser's applicationServerKey. */
  publicKey: string;
  /** Private scalar d (32 bytes), base64url. */
  privateKey: string;
}

const encoder = new TextEncoder();
/** UTF-8 bytes typed for WebCrypto in every runtime (DOM and Workers typings differ). */
const utf8 = (text: string) => new Uint8Array(encoder.encode(text));
/** The same exports typed alike in DOM and Workers typings. */
const exportRaw = async (key: CryptoKey) =>
  new Uint8Array((await crypto.subtle.exportKey('raw', key)) as ArrayBuffer);
type DeriveAlgorithm = Parameters<typeof crypto.subtle.deriveBits>[0];

export function base64UrlEncode(bytes: Uint8Array): string {
  let binary = '';
  for (const b of bytes) binary += String.fromCharCode(b);
  return btoa(binary).replace(/\+/g, '-').replace(/\//g, '_').replace(/=+$/, '');
}

export function base64UrlDecode(value: string): Uint8Array<ArrayBuffer> {
  const normalized = value.replace(/-/g, '+').replace(/_/g, '/');
  const binary = atob(normalized + '='.repeat((4 - (normalized.length % 4)) % 4));
  const bytes = new Uint8Array(binary.length);
  for (let i = 0; i < binary.length; i++) bytes[i] = binary.charCodeAt(i);
  return bytes;
}

function concat(...parts: Uint8Array[]): Uint8Array<ArrayBuffer> {
  const out = new Uint8Array(parts.reduce((n, p) => n + p.length, 0));
  let offset = 0;
  for (const p of parts) {
    out.set(p, offset);
    offset += p.length;
  }
  return out;
}

export async function generateVapidKeys(): Promise<VapidKeys> {
  const pair = (await crypto.subtle.generateKey({ name: 'ECDSA', namedCurve: 'P-256' }, true, [
    'sign',
    'verify',
  ])) as CryptoKeyPair;
  const raw = await exportRaw(pair.publicKey);
  const jwk = (await crypto.subtle.exportKey('jwk', pair.privateKey)) as JsonWebKey;
  return { publicKey: base64UrlEncode(raw), privateKey: jwk.d ?? '' };
}

function vapidPrivateJwk(keys: VapidKeys): JsonWebKey {
  const raw = base64UrlDecode(keys.publicKey);
  if (raw.length !== 65 || raw[0] !== 4) throw new Error('Invalid VAPID public key');
  return {
    kty: 'EC',
    crv: 'P-256',
    x: base64UrlEncode(raw.slice(1, 33)),
    y: base64UrlEncode(raw.slice(33, 65)),
    d: keys.privateKey,
    ext: true,
  };
}

/** `Authorization: vapid t=<JWT>, k=<public key>` for one push service origin. */
export async function vapidAuthorization(
  endpoint: string,
  keys: VapidKeys,
  subject: string,
  now = new Date(),
): Promise<string> {
  const header = base64UrlEncode(utf8(JSON.stringify({ typ: 'JWT', alg: 'ES256' })));
  const claims = base64UrlEncode(
    utf8(
      JSON.stringify({
        aud: new URL(endpoint).origin,
        // At most 24 h; 12 h leaves room for clock skew.
        exp: Math.floor(now.getTime() / 1000) + 12 * 3600,
        sub: subject,
      }),
    ),
  );
  const key = await crypto.subtle.importKey(
    'jwk',
    vapidPrivateJwk(keys),
    { name: 'ECDSA', namedCurve: 'P-256' },
    false,
    ['sign'],
  );
  const signature = new Uint8Array(
    await crypto.subtle.sign({ name: 'ECDSA', hash: 'SHA-256' }, key, utf8(`${header}.${claims}`)),
  );
  return `vapid t=${header}.${claims}.${base64UrlEncode(signature)}, k=${keys.publicKey}`;
}

async function hkdf(
  salt: Uint8Array<ArrayBuffer>,
  ikm: Uint8Array<ArrayBuffer>,
  info: Uint8Array<ArrayBuffer>,
  length: number,
) {
  const key = await crypto.subtle.importKey('raw', ikm, 'HKDF', false, ['deriveBits']);
  return new Uint8Array(
    await crypto.subtle.deriveBits({ name: 'HKDF', hash: 'SHA-256', salt, info }, key, length * 8),
  );
}

/** The keys both sides derive from the ECDH secret (RFC 8291 §3.4, RFC 8188 §2.2). */
export async function deriveContentKeys(
  ecdhSecret: Uint8Array<ArrayBuffer>,
  authSecret: Uint8Array<ArrayBuffer>,
  uaPublic: Uint8Array<ArrayBuffer>,
  asPublic: Uint8Array<ArrayBuffer>,
  salt: Uint8Array<ArrayBuffer>,
) {
  const keyInfo = concat(utf8('WebPush: info\0'), uaPublic, asPublic);
  const ikm = await hkdf(authSecret, ecdhSecret, keyInfo, 32);
  const cek = await hkdf(salt, ikm, utf8('Content-Encoding: aes128gcm\0'), 16);
  const nonce = await hkdf(salt, ikm, utf8('Content-Encoding: nonce\0'), 12);
  return { cek, nonce };
}

const RECORD_SIZE = 4096;

/** Encrypts one payload for one subscription: the body of the POST to the push service. */
export async function encryptPushPayload(
  subscription: PushSubscriptionKeys,
  payload: string,
  /** Fixed sender key and salt: only for the RFC test vector. */
  fixed?: {
    privateKey: CryptoKey;
    publicKey: Uint8Array<ArrayBuffer>;
    salt: Uint8Array<ArrayBuffer>;
  },
): Promise<Uint8Array<ArrayBuffer>> {
  const uaPublic = base64UrlDecode(subscription.p256dh);
  const authSecret = base64UrlDecode(subscription.auth);
  if (uaPublic.length !== 65 || authSecret.length < 16) throw new Error('Invalid subscription');
  const ephemeral = fixed
    ? null
    : ((await crypto.subtle.generateKey({ name: 'ECDH', namedCurve: 'P-256' }, true, [
        'deriveBits',
      ])) as CryptoKeyPair);
  const asPrivate = fixed?.privateKey ?? (ephemeral as CryptoKeyPair).privateKey;
  const asPublic = fixed?.publicKey ?? (await exportRaw((ephemeral as CryptoKeyPair).publicKey));
  const uaKey = await crypto.subtle.importKey(
    'raw',
    uaPublic,
    { name: 'ECDH', namedCurve: 'P-256' },
    false,
    [],
  );
  const ecdhSecret = new Uint8Array(
    await crypto.subtle.deriveBits(
      { name: 'ECDH', public: uaKey } as unknown as DeriveAlgorithm,
      asPrivate,
      256,
    ),
  );
  const salt = fixed?.salt ?? crypto.getRandomValues(new Uint8Array(16));
  const { cek, nonce } = await deriveContentKeys(ecdhSecret, authSecret, uaPublic, asPublic, salt);
  const data = utf8(payload);
  // One record: the data, then the 0x02 delimiter of the last record.
  if (data.length + 1 + 16 > RECORD_SIZE) throw new Error('Push payload too large');
  const plaintext = concat(data, new Uint8Array([2]));
  const key = await crypto.subtle.importKey('raw', cek, 'AES-GCM', false, ['encrypt']);
  const ciphertext = new Uint8Array(
    await crypto.subtle.encrypt({ name: 'AES-GCM', iv: nonce }, key, plaintext),
  );
  const header = new Uint8Array(16 + 4 + 1 + asPublic.length);
  header.set(salt, 0);
  new DataView(header.buffer).setUint32(16, RECORD_SIZE);
  header[20] = asPublic.length;
  header.set(asPublic, 21);
  return concat(header, ciphertext);
}

export interface PushRequest {
  url: string;
  headers: Record<string, string>;
  body: Uint8Array<ArrayBuffer>;
}

/** Everything needed to `fetch` a push service (kept separate so it can be tested offline). */
export async function buildPushRequest(
  subscription: PushSubscriptionKeys,
  payload: string,
  keys: VapidKeys,
  subject: string,
  options: { ttlSeconds?: number; urgency?: 'normal' | 'high'; topic?: string } = {},
): Promise<PushRequest> {
  const body = await encryptPushPayload(subscription, payload);
  const headers: Record<string, string> = {
    authorization: await vapidAuthorization(subscription.endpoint, keys, subject),
    'content-encoding': 'aes128gcm',
    'content-type': 'application/octet-stream',
    ttl: String(options.ttlSeconds ?? 86_400),
    urgency: options.urgency ?? 'normal',
  };
  // A newer message with the same topic replaces an undelivered older one.
  if (options.topic) headers.topic = options.topic.replace(/[^A-Za-z0-9_-]/g, '').slice(0, 32);
  return { url: subscription.endpoint, headers, body };
}

/** Only real push services over https: the endpoint comes from the browser, never trust it blindly. */
export function isPushEndpoint(endpoint: string, extraOrigins: string[] = []): boolean {
  try {
    const url = new URL(endpoint);
    // Tests and e2e point at a local fake push service.
    if (extraOrigins.includes(url.origin)) return true;
    if (url.protocol !== 'https:' || url.username || url.password) return false;
    const host = url.hostname;
    return (
      host === 'fcm.googleapis.com' ||
      host.endsWith('.push.services.mozilla.com') ||
      host.endsWith('.notify.windows.com') ||
      host.endsWith('.push.apple.com') ||
      host === 'push.apple.com'
    );
  } catch {
    return false;
  }
}

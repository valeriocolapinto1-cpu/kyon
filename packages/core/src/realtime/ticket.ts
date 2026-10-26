import { fromBase64, toBase64 } from '../auth/encoding';

/**
 * Short-lived, signed permission to join one realtime room. The web Worker issues it after
 * checking the session and can(); the Durable Object only verifies the signature, so it never
 * needs Better Auth or the permission tables.
 */
export interface RealtimeTicket {
  userId: string;
  /** `project:<id>` or `general`. */
  room: string;
  /** Expiry, ms since epoch. */
  exp: number;
}

export const TICKET_TTL_MS = 60_000;

const encoder = new TextEncoder();

const toBase64Url = (bytes: Uint8Array) =>
  toBase64(bytes).replace(/\+/g, '-').replace(/\//g, '_').replace(/=+$/, '');

function fromBase64Url(value: string): Uint8Array<ArrayBuffer> {
  const padded = value.replace(/-/g, '+').replace(/_/g, '/');
  return fromBase64(padded + '='.repeat((4 - (padded.length % 4)) % 4));
}

function hmacKey(secret: string, usage: 'sign' | 'verify') {
  return crypto.subtle.importKey(
    'raw',
    encoder.encode(`kyon/realtime/v1/${secret}`),
    { name: 'HMAC', hash: 'SHA-256' },
    false,
    [usage],
  );
}

export async function signTicket(secret: string, ticket: RealtimeTicket): Promise<string> {
  const body = toBase64Url(encoder.encode(JSON.stringify(ticket)));
  const signature = await crypto.subtle.sign(
    'HMAC',
    await hmacKey(secret, 'sign'),
    encoder.encode(body),
  );
  return `${body}.${toBase64Url(new Uint8Array(signature))}`;
}

/** Returns the ticket when the signature is valid (constant time), it is for `room` and not expired. */
export async function verifyTicket(
  secret: string,
  token: string,
  room: string,
  now = Date.now(),
): Promise<RealtimeTicket | null> {
  const [body, signature, extra] = token.split('.');
  if (!body || !signature || extra !== undefined || !secret) return null;
  let valid = false;
  try {
    valid = await crypto.subtle.verify(
      'HMAC',
      await hmacKey(secret, 'verify'),
      fromBase64Url(signature),
      encoder.encode(body),
    );
  } catch {
    // Malformed base64: same answer as a wrong signature.
    return null;
  }
  if (!valid) return null;
  let ticket: RealtimeTicket;
  try {
    ticket = JSON.parse(new TextDecoder().decode(fromBase64Url(body))) as RealtimeTicket;
  } catch {
    return null;
  }
  if (typeof ticket.userId !== 'string' || ticket.room !== room) return null;
  if (typeof ticket.exp !== 'number' || ticket.exp < now) return null;
  return ticket;
}

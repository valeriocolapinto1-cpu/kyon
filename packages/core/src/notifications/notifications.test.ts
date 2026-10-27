import { describe, expect, it } from 'vitest';
import {
  DEFAULT_NOTIFICATION_PREFS,
  base64UrlDecode,
  base64UrlEncode,
  buildPushRequest,
  deliveryChannels,
  deriveContentKeys,
  encryptPushPayload,
  generateVapidKeys,
  inQuietHours,
  isPushEndpoint,
  sanitizeNotificationPrefs,
  shouldGroup,
  vapidAuthorization,
} from './index';

const prefs = DEFAULT_NOTIFICATION_PREFS;
// 2026-07-01 is summer time in Rome (UTC+2).
const romeTime = (hhmm: string) => new Date(`2026-07-01T${hhmm}:00+02:00`);

describe('preferences', () => {
  it('fills in defaults, drops junk, validates times and zone', () => {
    const p = sanitizeNotificationPrefs({
      matrix: { mention: { push: false }, nope: { inapp: true }, message: 'x' },
      quietStart: '25:00',
      quietEnd: '07:30',
      mentionsInQuiet: 'yes',
      timeZone: 'Mars/Olympus',
    });
    expect(p.matrix.mention).toEqual({ inapp: true, push: false, email: false });
    expect(p.matrix.message).toEqual(prefs.matrix.message);
    expect(p).toMatchObject({
      quietStart: '23:00',
      quietEnd: '07:30',
      mentionsInQuiet: false,
      timeZone: 'Europe/Rome',
    });
    expect(Object.keys(p.matrix)).not.toContain('nope');
    expect(sanitizeNotificationPrefs(null)).toEqual(prefs);
  });

  it('quiet hours across midnight, in the person’s time zone', () => {
    expect(inQuietHours(romeTime('23:30'), prefs)).toBe(true);
    expect(inQuietHours(romeTime('07:59'), prefs)).toBe(true);
    expect(inQuietHours(romeTime('08:00'), prefs)).toBe(false);
    expect(inQuietHours(romeTime('22:59'), prefs)).toBe(false);
    const day = { ...prefs, quietStart: '13:00', quietEnd: '14:00' };
    expect(inQuietHours(romeTime('13:30'), day)).toBe(true);
    expect(inQuietHours(romeTime('14:00'), day)).toBe(false);
    expect(
      inQuietHours(romeTime('03:00'), { ...prefs, quietStart: '09:00', quietEnd: '09:00' }),
    ).toBe(false);
    // Same instant, another zone: 23:30 in Rome is 17:30 in New York.
    expect(inQuietHours(romeTime('23:30'), { ...prefs, timeZone: 'America/New_York' })).toBe(false);
  });
});

describe('delivery rules', () => {
  const day = { now: romeTime('12:00'), onlineHere: false, roomMuted: false };
  const night = { ...day, now: romeTime('02:00') };
  const all = sanitizeNotificationPrefs({
    matrix: Object.fromEntries(
      ['mention', 'assigned', 'due', 'message', 'run'].map((e) => [
        e,
        { inapp: true, push: true, email: true },
      ]),
    ),
  });
  const list = (s: Set<string>) => [...s].sort();

  it('follows the matrix by day', () => {
    expect(list(deliveryChannels('mention', prefs, day))).toEqual(['inapp', 'push']);
    expect(list(deliveryChannels('message', prefs, day))).toEqual(['inapp']);
    expect(list(deliveryChannels('run', all, day))).toEqual(['email', 'inapp', 'push']);
  });

  it('quiet hours keep only in-app, unless mentions are allowed', () => {
    expect(list(deliveryChannels('assigned', all, night))).toEqual(['inapp']);
    expect(list(deliveryChannels('mention', all, night))).toEqual(['inapp']);
    expect(list(deliveryChannels('mention', { ...all, mentionsInQuiet: true }, night))).toEqual([
      'email',
      'inapp',
      'push',
    ]);
  });

  it('no push while looking at the chat; muted chats stay silent', () => {
    const online = { ...day, onlineHere: true };
    expect(list(deliveryChannels('message', all, online))).toEqual([]);
    expect(list(deliveryChannels('mention', all, online))).toEqual(['inapp']);
    expect(list(deliveryChannels('assigned', all, online))).toEqual(['email', 'inapp', 'push']);
    const muted = { ...day, roomMuted: true };
    expect(list(deliveryChannels('message', all, muted))).toEqual([]);
    expect(list(deliveryChannels('mention', all, muted))).toEqual(['inapp']);
  });

  it('groups unread news of the same kind within the window', () => {
    const now = new Date('2026-07-01T10:00:00Z');
    const recent = {
      groupKey: 'room:x',
      readAt: null,
      updatedAt: new Date(now.getTime() - 60_000),
    };
    expect(shouldGroup(recent, 'room:x', now)).toBe(true);
    expect(shouldGroup(recent, 'room:y', now)).toBe(false);
    expect(shouldGroup({ ...recent, readAt: now }, 'room:x', now)).toBe(false);
    expect(
      shouldGroup({ ...recent, updatedAt: new Date(now.getTime() - 11 * 60_000) }, 'room:x', now),
    ).toBe(false);
    expect(shouldGroup(null, 'room:x', now)).toBe(false);
    expect(shouldGroup(recent, null, now)).toBe(false);
  });
});

describe('web push', () => {
  it('base64url round trip', () => {
    const bytes = crypto.getRandomValues(new Uint8Array(65));
    expect(base64UrlDecode(base64UrlEncode(bytes))).toEqual(bytes);
  });

  it('signs a VAPID JWT the push service can verify', async () => {
    const keys = await generateVapidKeys();
    expect(base64UrlDecode(keys.publicKey)).toHaveLength(65);
    const now = new Date('2026-07-01T10:00:00Z');
    const auth = await vapidAuthorization(
      'https://fcm.googleapis.com/fcm/send/abc',
      keys,
      'https://kyon.example',
      now,
    );
    const match = /^vapid t=([^.]+)\.([^.]+)\.([^,]+), k=(.+)$/.exec(auth);
    expect(match).toBeTruthy();
    const [, header, claims, signature, k] = match as unknown as string[];
    expect(k).toBe(keys.publicKey);
    expect(JSON.parse(new TextDecoder().decode(base64UrlDecode(claims ?? '')))).toEqual({
      aud: 'https://fcm.googleapis.com',
      exp: now.getTime() / 1000 + 12 * 3600,
      sub: 'https://kyon.example',
    });
    const publicKey = await crypto.subtle.importKey(
      'raw',
      base64UrlDecode(keys.publicKey),
      { name: 'ECDSA', namedCurve: 'P-256' },
      false,
      ['verify'],
    );
    const valid = await crypto.subtle.verify(
      { name: 'ECDSA', hash: 'SHA-256' },
      publicKey,
      base64UrlDecode(signature ?? ''),
      new TextEncoder().encode(`${header}.${claims}`),
    );
    expect(valid).toBe(true);
  });

  it('encrypts a payload only the browser can read (RFC 8291 round trip)', async () => {
    // The browser side: its key pair and auth secret.
    const browser = (await crypto.subtle.generateKey({ name: 'ECDH', namedCurve: 'P-256' }, true, [
      'deriveBits',
    ])) as CryptoKeyPair;
    const uaPublic = new Uint8Array(await crypto.subtle.exportKey('raw', browser.publicKey));
    const authSecret = crypto.getRandomValues(new Uint8Array(16));
    const subscription = {
      endpoint: 'https://fcm.googleapis.com/fcm/send/xyz',
      p256dh: base64UrlEncode(uaPublic),
      auth: base64UrlEncode(authSecret),
    };
    const keys = await generateVapidKeys();
    const message = JSON.stringify({ title: 'Ciao', body: 'Menzione da Valerio · è tutto ok' });
    const request = await buildPushRequest(subscription, message, keys, 'mailto:a@b.c', {
      topic: 'room:project/1!',
      urgency: 'high',
    });
    expect(request.headers).toMatchObject({
      'content-encoding': 'aes128gcm',
      ttl: '86400',
      urgency: 'high',
      topic: 'roomproject1',
    });

    // Decrypt as the browser would.
    const body = request.body;
    const salt = body.slice(0, 16);
    expect(new DataView(body.buffer).getUint32(16)).toBe(4096);
    const idLength = body[20] ?? 0;
    const asPublic = body.slice(21, 21 + idLength);
    const ciphertext = body.slice(21 + idLength);
    const asKey = await crypto.subtle.importKey(
      'raw',
      asPublic,
      { name: 'ECDH', namedCurve: 'P-256' },
      false,
      [],
    );
    const ecdh = new Uint8Array(
      await crypto.subtle.deriveBits({ name: 'ECDH', public: asKey }, browser.privateKey, 256),
    );
    const { cek, nonce } = await deriveContentKeys(ecdh, authSecret, uaPublic, asPublic, salt);
    const aes = await crypto.subtle.importKey('raw', cek, 'AES-GCM', false, ['decrypt']);
    const plain = new Uint8Array(
      await crypto.subtle.decrypt({ name: 'AES-GCM', iv: nonce }, aes, ciphertext),
    );
    expect(plain.at(-1)).toBe(2);
    expect(new TextDecoder().decode(plain.slice(0, -1))).toBe(message);
  });

  it('matches the RFC 8291 test vector (Appendix A)', async () => {
    const asPublic = base64UrlDecode(
      'BP4z9KsN6nGRTbVYI_c7VJSPQTBtkgcy27mlmlMoZIIgDll6e3vCYLocInmYWAmS6TlzAC8wEqKK6PBru3jl7A8',
    );
    const privateKey = await crypto.subtle.importKey(
      'jwk',
      {
        kty: 'EC',
        crv: 'P-256',
        x: base64UrlEncode(asPublic.slice(1, 33)),
        y: base64UrlEncode(asPublic.slice(33, 65)),
        d: 'yfWPiYE-n46HLnH0KqZOF1fJJU3MYrct3AELtAQ-oRw',
      },
      { name: 'ECDH', namedCurve: 'P-256' },
      false,
      ['deriveBits'],
    );
    const body = await encryptPushPayload(
      {
        endpoint: 'https://push.example.net/push/JzLQ3raZJfFBR0aqvOMsLrt54w4rJUsV',
        p256dh:
          'BCVxsr7N_eNgVRqvHtD0zTZsEc6-VV-JvLexhqUzORcxaOzi6-AYWXvTBHm4bjyPjs7Vd8pZGH6SRpkNtoIAiw4',
        auth: 'BTBZMqHH6r4Tts7J_aSIgg',
      },
      'When I grow up, I want to be a watermelon',
      { privateKey, publicKey: asPublic, salt: base64UrlDecode('DGv6ra1nlYgDCS1FRnbzlw') },
    );
    expect(base64UrlEncode(body)).toBe(
      'DGv6ra1nlYgDCS1FRnbzlwAAEABBBP4z9KsN6nGRTbVYI_c7VJSPQTBtkgcy27mlmlMoZIIgDll6e3vCYLocInmYWAmS6TlzAC8wEqKK6PBru3jl7A_yl95bQpu6cVPTpK4Mqgkf1CXztLVBSt2Ks3oZwbuwXPXLWyouBWLVWGNWQexSgSxsj_Qulcy4a-fN',
    );
  });

  it('accepts only real push services (no SSRF through a forged endpoint)', () => {
    expect(isPushEndpoint('https://fcm.googleapis.com/fcm/send/abc')).toBe(true);
    expect(isPushEndpoint('https://web.push.apple.com/QGx')).toBe(true);
    expect(isPushEndpoint('https://updates.push.services.mozilla.com/wpush/v2/x')).toBe(true);
    expect(isPushEndpoint('https://wns2-par02p.notify.windows.com/w/?token=x')).toBe(true);
    for (const bad of [
      'http://fcm.googleapis.com/x',
      'https://evil.com/fcm.googleapis.com',
      'https://fcm.googleapis.com.evil.com/x',
      'https://user:pw@fcm.googleapis.com/x',
      'https://169.254.169.254/latest',
      'not a url',
    ])
      expect(isPushEndpoint(bad)).toBe(false);
    expect(isPushEndpoint('http://localhost:8798/push/1', ['http://localhost:8798'])).toBe(true);
  });
});

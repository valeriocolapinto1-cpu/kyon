/** Sessions last until explicit logout; the cookie is refreshed daily and the token rotated weekly. */
export const SESSION_EXPIRES_IN_S = 400 * 24 * 60 * 60; // browsers cap cookies at 400 days
export const SESSION_UPDATE_AGE_S = 24 * 60 * 60;
export const SESSION_ROTATE_AFTER_MS = 7 * 24 * 60 * 60 * 1000;

export function shouldRotateSession(createdAt: Date, now: Date): boolean {
  return now.getTime() - createdAt.getTime() >= SESSION_ROTATE_AFTER_MS;
}

/** Short device label from a User-Agent, for the sessions list ("iPhone · Safari"). */
export function describeUserAgent(userAgent: string | null | undefined): string {
  if (!userAgent) return 'Dispositivo sconosciuto';
  const ua = userAgent;
  const device = /iPhone/.test(ua)
    ? 'iPhone'
    : /iPad/.test(ua)
      ? 'iPad'
      : /Android/.test(ua)
        ? 'Android'
        : /Macintosh|Mac OS X/.test(ua)
          ? 'Mac'
          : /Windows/.test(ua)
            ? 'Windows'
            : /Linux/.test(ua)
              ? 'Linux'
              : 'Dispositivo';
  const browser = /Edg\//.test(ua)
    ? 'Edge'
    : /Firefox\//.test(ua)
      ? 'Firefox'
      : /Chrome\//.test(ua)
        ? 'Chrome'
        : /Safari\//.test(ua)
          ? 'Safari'
          : null;
  return browser ? `${device} · ${browser}` : device;
}

/**
 * Content Security Policy, shared by next.config.ts (Worker responses) and public/_headers
 * (static assets; a test keeps the two identical).
 * Static pages can't carry per-request nonces, so inline scripts (Next's bootstrap, the theme
 * boot script) need 'unsafe-inline'; everything else is locked to this origin. Attachments get
 * a stricter CSP (sandbox) from their own route. `next dev` talks to the realtime Worker on
 * another port.
 */
export function contentSecurityPolicy(dev = false): string {
  return [
    "default-src 'self'",
    "script-src 'self' 'unsafe-inline'",
    "style-src 'self' 'unsafe-inline'",
    "img-src 'self' data: blob: https://avatars.githubusercontent.com",
    "font-src 'self'",
    `connect-src 'self'${dev ? ' ws://localhost:8788' : ''}`,
    "worker-src 'self'",
    "manifest-src 'self'",
    "frame-src 'none'",
    "frame-ancestors 'none'",
    "object-src 'none'",
    "base-uri 'self'",
    "form-action 'self'",
  ].join('; ');
}

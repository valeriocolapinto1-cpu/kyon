import { readFileSync } from 'node:fs';
import path from 'node:path';
import { describe, expect, it } from 'vitest';
import { contentSecurityPolicy } from './securityHeaders';

describe('security headers', () => {
  it('static assets carry the same CSP as Worker responses', () => {
    const headers = readFileSync(path.join(__dirname, '..', '..', 'public', '_headers'), 'utf8');
    expect(headers).toContain(`Content-Security-Policy: ${contentSecurityPolicy()}`);
    expect(headers).toContain('Strict-Transport-Security: max-age=31536000; includeSubDomains');
  });

  it('locks down framing, plugins and other origins', () => {
    const csp = contentSecurityPolicy();
    for (const rule of [
      "frame-ancestors 'none'",
      "object-src 'none'",
      "base-uri 'self'",
      "connect-src 'self'",
    ])
      expect(csp).toContain(rule);
    expect(csp).not.toContain('localhost');
    expect(contentSecurityPolicy(true)).toContain('ws://localhost:8788');
  });
});

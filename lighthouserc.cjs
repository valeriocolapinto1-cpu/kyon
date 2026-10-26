// Lighthouse CI on the production bundle (local workerd), driven by scripts/lighthouse.ts which
// starts the server with fresh state and passes a logged-in session cookie. Mobile emulation is the default.
const base = process.env.LHCI_BASE_URL ?? 'http://localhost:8790';
module.exports = {
  ci: {
    collect: {
      url: ['/', '/progetti', '/chat', '/settings', '/login'].map((p) => `${base}${p}`),
      numberOfRuns: 1,
      settings: {
        chromeFlags: '--no-sandbox --headless=new',
        extraHeaders: process.env.LHCI_COOKIE
          ? JSON.stringify({ Cookie: process.env.LHCI_COOKIE })
          : undefined,
        // Local workerd has no edge cache or HTTP/2: skip the CDN-only audit.
        skipAudits: ['uses-http2'],
      },
    },
    assert: {
      assertions: {
        'categories:accessibility': ['error', { minScore: 0.95 }],
        'categories:performance': ['error', { minScore: 0.8 }],
        'categories:best-practices': ['warn', { minScore: 0.9 }],
      },
    },
    upload: { target: 'filesystem', outputDir: '.lighthouseci' },
  },
};

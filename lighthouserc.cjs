// Lighthouse CI on the production bundle (local workerd). Mobile emulation is Lighthouse's default.
const PORT = 8790;
module.exports = {
  ci: {
    collect: {
      startServerCommand: `pnpm --filter @kyon/web exec wrangler dev --port ${PORT} --persist-to ../../.wrangler/state --log-level warn`,
      startServerReadyPattern: 'Ready on',
      startServerReadyTimeout: 120000,
      url: ['/', '/progetti', '/chat', '/settings'].map((p) => `http://localhost:${PORT}${p}`),
      numberOfRuns: 1,
      settings: {
        chromeFlags: '--no-sandbox --headless=new',
        // Local workerd has no edge cache; skip the HTTP/2 + CDN-only audits that would be noise here.
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

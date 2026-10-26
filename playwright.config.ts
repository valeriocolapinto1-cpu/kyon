import { defineConfig, devices } from '@playwright/test';

const PORT = 8787;
const ADMIN_STATE = 'e2e/.auth/admin.json';

/**
 * E2E against the real production bundle (OpenNext on local workerd), not `next dev`.
 * Run `pnpm build` first; `pnpm e2e` starts the Worker with fresh simulated D1/KV/R2.
 */
export default defineConfig({
  testDir: './e2e',
  fullyParallel: true,
  forbidOnly: !!process.env.CI,
  retries: process.env.CI ? 1 : 0,
  workers: process.env.CI ? 2 : undefined,
  reporter: process.env.CI ? [['github'], ['html', { open: 'never' }]] : 'list',
  use: {
    baseURL: `http://localhost:${PORT}`,
    trace: 'retain-on-failure',
    locale: 'it-IT',
    timezoneId: 'Europe/Rome',
  },
  projects: [
    // Creates the first (admin) account through the bootstrap code and saves its cookies.
    { name: 'setup', testMatch: /global\.setup\.ts/ },
    {
      name: 'mobile',
      dependencies: ['setup'],
      use: {
        ...devices['Pixel 7'],
        viewport: { width: 390, height: 844 },
        browserName: 'chromium',
        storageState: ADMIN_STATE,
      },
    },
    {
      name: 'tablet',
      dependencies: ['setup'],
      use: {
        ...devices['Desktop Chrome'],
        viewport: { width: 1024, height: 768 },
        hasTouch: true,
        storageState: ADMIN_STATE,
      },
    },
    {
      name: 'desktop',
      dependencies: ['setup'],
      use: {
        ...devices['Desktop Chrome'],
        viewport: { width: 1280, height: 800 },
        storageState: ADMIN_STATE,
      },
    },
  ],
  webServer: {
    command: 'pnpm exec tsx scripts/e2e-server.ts',
    url: `http://localhost:${PORT}/api/health`,
    // Always a fresh server: the e2e database is wiped at start.
    reuseExistingServer: false,
    timeout: 120_000,
    stdout: 'ignore',
    stderr: 'pipe',
  },
});

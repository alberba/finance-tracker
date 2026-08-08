import { defineConfig, devices } from '@playwright/test'

/**
 * Dedicated Playwright config for the WP7/WP10 sync-v2 flow
 * (`PUBLIC_SYNC_V2=true`).
 *
 * `PUBLIC_SYNC_V2` (`src/lib/client/feature-flags.ts`) is read via
 * `import.meta.env` — a Vite/Astro build-time value, not something a test
 * can toggle per-request. The main `playwright.config.ts` boots its
 * `webServer` without the flag (so the default-off legacy path is what the
 * bulk of the E2E suite — written against the pre-sync-v2 app — exercises).
 * Specs that need the v2 IndexedDB/outbox/`/api/sync` path (multi-user
 * isolation, offline CRUD + conflict resolution) run against a second dev
 * server, started with the flag on, on a different port so both configs
 * can run in the same CI job without colliding.
 */
export default defineConfig({
  testDir: './tests/e2e',
  testMatch: ['multi-user-isolation.spec.ts', 'offline-sync.spec.ts'],
  fullyParallel: true,
  forbidOnly: Boolean(process.env.CI),
  retries: process.env.CI ? 2 : 0,
  workers: process.env.CI ? 2 : undefined,
  reporter: [['list'], ['html', { open: 'never', outputFolder: 'playwright-report-sync-v2' }]],
  use: {
    baseURL: process.env.PLAYWRIGHT_BASE_URL || 'http://127.0.0.1:4322',
    trace: 'retain-on-failure',
    screenshot: 'only-on-failure',
    video: 'retain-on-failure',
  },
  webServer: {
    command: 'pnpm dev --host 127.0.0.1 --port 4322',
    url: 'http://127.0.0.1:4322',
    reuseExistingServer: !process.env.CI,
    timeout: 120000,
    env: {
      PUBLIC_SYNC_V2: 'true',
    },
  },
  projects: [
    {
      name: 'chromium',
      use: { ...devices['Desktop Chrome'] },
    },
  ],
})

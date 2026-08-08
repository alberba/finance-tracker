import { defineConfig, devices } from '@playwright/test'

export default defineConfig({
  testDir: './tests/e2e',
  fullyParallel: true,
  forbidOnly: Boolean(process.env.CI),
  retries: process.env.CI ? 2 : 0,
  workers: 3,
  reporter: [['list'], ['html', { open: 'never' }]],
  use: {
    baseURL: process.env.PLAYWRIGHT_BASE_URL || 'http://127.0.0.1:4321',
    trace: 'retain-on-failure',
    screenshot: 'only-on-failure',
    video: 'retain-on-failure',
  },
  webServer: {
    command: 'pnpm dev --host 127.0.0.1 --port 4321',
    url: 'http://127.0.0.1:4321',
    reuseExistingServer: !process.env.CI,
    timeout: 120000,
  },
  projects: [
    {
      name: 'chromium',
      use: { ...devices['Desktop Chrome'] },
      // `layout-visual.spec.ts`/`mobile-smoke.spec.ts` are mobile-only specs
      // (asserting mobile breakpoints/viewport behavior) scoped to the
      // `mobile-chrome`/`pixel-10` projects below via their own `testMatch`;
      // without this exclusion here, the desktop `chromium` project (which
      // has no `testMatch`, so it runs every spec by default) also picked
      // them up and ran them at a desktop viewport, which isn't what those
      // specs test and wastes CI time running spurious mobile assertions
      // against a 1280px-wide page.
      //
      // `multi-user-isolation.spec.ts`/`offline-sync.spec.ts` (WP10) need
      // `PUBLIC_SYNC_V2=true`, which `import.meta.env` bakes in at this
      // config's `webServer` boot — this config deliberately boots without
      // it (see `playwright.sync-v2.config.ts`'s doc comment), so without
      // this exclusion the desktop `chromium` project here also picked them
      // up and ran them against the flag-off legacy path, where the
      // IndexedDB/outbox/`/api/sync` machinery they assert on never
      // engages (`isSyncV2Enabled()` false everywhere) — spurious failures
      // unrelated to any real bug. Run those two via `pnpm test:e2e:sync-v2`.
      testIgnore: [
        'tests/e2e/layout-visual.spec.ts',
        'tests/e2e/mobile-smoke.spec.ts',
        'tests/e2e/multi-user-isolation.spec.ts',
        'tests/e2e/offline-sync.spec.ts',
      ],
    },
    {
      name: 'mobile-chrome',
      use: { ...devices['Pixel 5'] },
      testMatch: ['tests/e2e/layout-visual.spec.ts', 'tests/e2e/mobile-smoke.spec.ts'],
    },
    {
      name: 'pixel-10',
      use: {
        ...devices['Pixel 5'],
        viewport: { width: 412, height: 923 },
        deviceScaleFactor: 2.625,
      },
      testMatch: ['tests/e2e/layout-visual.spec.ts', 'tests/e2e/mobile-smoke.spec.ts'],
    },
  ],
})

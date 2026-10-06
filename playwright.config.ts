import { defineConfig, devices } from '@playwright/test'

import { createPlaywrightRuntime } from './playwright.shared'

export default defineConfig(
  createPlaywrightRuntime({
    port: 4321,
    htmlOutputFolder: 'playwright-report',
    blobOutputDir: 'blob-report',
    tag: '@legacy',
    env: { PUBLIC_SYNC_V2: 'false' },
  }),
  {
    // One worker protects the legacy owner blob; individual tests can still
    // be sharded across runners, each with its own D1 database.
    fullyParallel: true,
    workers: 1,
    projects: [
      {
        name: 'chromium',
        use: { ...devices['Desktop Chrome'] },
        testIgnore: [
          'authentication.spec.ts',
          'bitvavo.spec.ts',

          'layout-visual.spec.ts',
          'mobile-smoke.spec.ts',
          'multi-user-isolation.spec.ts',
          'offline-sync.spec.ts',
          'movement-commands.spec.ts',
          'subscription-charges.spec.ts',
        ],
      },
      {
        name: 'mobile-chrome',
        use: { ...devices['Pixel 5'] },
        testMatch: ['layout-visual.spec.ts', 'mobile-smoke.spec.ts'],
      },
    ],
  },
)

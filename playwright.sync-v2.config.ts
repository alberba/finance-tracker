import { defineConfig, devices } from '@playwright/test'

import { createPlaywrightRuntime } from './playwright.shared'

export default defineConfig(
  createPlaywrightRuntime({
    port: 4322,
    htmlOutputFolder: 'playwright-report-sync-v2',
    blobOutputDir: 'blob-report-sync-v2',
    tag: '@sync-v2',
    env: { PUBLIC_SYNC_V2: 'true' },
  }),
  {
    fullyParallel: false,
    workers: 1,
    testMatch: [
      'bitvavo.spec.ts',
      'movement-commands.spec.ts',
      'multi-user-isolation.spec.ts',
      'onboarding.spec.ts',
      'offline-sync.spec.ts',
      'subscription-charges.spec.ts',
    ],
    projects: [
      {
        name: 'chromium',
        use: { ...devices['Desktop Chrome'] },
      },
    ],
  },
)

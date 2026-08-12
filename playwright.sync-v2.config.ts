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
    testMatch: ['multi-user-isolation.spec.ts', 'offline-sync.spec.ts'],
    projects: [
      {
        name: 'chromium',
        use: { ...devices['Desktop Chrome'] },
      },
    ],
  },
)

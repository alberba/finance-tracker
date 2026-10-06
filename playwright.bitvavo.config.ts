import { defineConfig, devices } from '@playwright/test'
import { createPlaywrightRuntime } from './playwright.shared'

export default defineConfig(
  createPlaywrightRuntime({
    port: 4323,
    htmlOutputFolder: 'playwright-report-bitvavo',
    blobOutputDir: 'blob-report-bitvavo',
    tag: '@bitvavo',
    env: { PUBLIC_SYNC_V2: 'true' },
  }),
  {
    workers: 1,
    testMatch: ['bitvavo.spec.ts'],
    projects: [{ name: 'chromium', use: { ...devices['Desktop Chrome'] } }],
  },
)

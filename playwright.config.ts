import { defineConfig, devices } from '@playwright/test'

import { createPlaywrightRuntime } from './playwright.shared'

export default defineConfig(
  createPlaywrightRuntime({
    port: 4321,
    htmlOutputFolder: 'playwright-report',
    blobOutputDir: 'blob-report',
    tag: '@sync-v2',
  }),
  {
    // A scenario owns its isolated user; each CI shard has its own D1.
    fullyParallel: true,
    workers: 1,
    projects: [
      ...[
        { name: 'chromium', device: 'Desktop Chrome' },
        { name: 'firefox', device: 'Desktop Firefox' },
        { name: 'webkit', device: 'Desktop Safari' },
      ].map(({ name, device }) => ({
        name,
        default: name === 'chromium',
        use: { ...devices[device] },
        testIgnore: [
          'authentication.spec.ts',
          'bitvavo.spec.ts',

          'layout-visual.spec.ts',
          'mobile-smoke.spec.ts',
          'multi-user-isolation.spec.ts',
          'offline-sync.spec.ts',
          'onboarding.spec.ts',
          'movement-commands.spec.ts',
          'subscription-charges.spec.ts',
        ],
      })),
      {
        name: 'mobile-chrome',
        use: { ...devices['Pixel 5'] },
        testMatch: ['layout-visual.spec.ts', 'mobile-smoke.spec.ts'],
      },
    ],
  },
)

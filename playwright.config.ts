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

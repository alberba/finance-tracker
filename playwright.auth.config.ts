import { defineConfig, devices } from '@playwright/test'
import { browserConnectionOptions } from './playwright.browser'
import { randomUUID } from 'node:crypto'
import { tmpdir } from 'node:os'
import { resolve } from 'node:path'
process.env.AUTH_TEST_STATE_PATH ??= resolve(tmpdir(), `finance-auth-${randomUUID()}`)
const port = Number(process.env.AUTH_TEST_PORT ?? 4466)
export default defineConfig({
  testDir: './tests/e2e',
  outputDir: 'test-results-auth',
  testMatch: 'authentication.spec.ts',
  workers: 1,
  failOnFlakyTests: Boolean(process.env.CI),
  retries: process.env.CI ? 1 : 0,
  use: {
    connectOptions: browserConnectionOptions,
    baseURL: `http://localhost:${port}`,
    trace: 'retain-on-first-failure',
    screenshot: 'only-on-failure',
  },
  projects: [
    { name: 'chromium-auth', use: { ...devices['Desktop Chrome'] } },
    { name: 'mobile-auth', grep: /@smoke/, use: { ...devices['Pixel 5'] } },
  ],
  webServer: {
    command: 'node tests/e2e/authentication/server.mjs',
    url: `http://localhost:${port}/login`,
    reuseExistingServer: false,
    timeout: 120000,
  },
})

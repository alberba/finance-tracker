import { defineConfig, devices } from '@playwright/test'
const port = Number(process.env.AUTH_TEST_PORT ?? 4466)
export default defineConfig({
  testDir: './tests/e2e',
  testMatch: 'authentication.spec.ts',
  workers: 1,
  failOnFlakyTests: Boolean(process.env.CI),
  retries: process.env.CI ? 1 : 0,
  use: {
    baseURL: `http://localhost:${port}`,
    trace: 'retain-on-first-failure',
    screenshot: 'only-on-failure',
  },
  projects: [
    { name: 'chromium-auth', use: { ...devices['Desktop Chrome'] } },
    { name: 'mobile-auth', use: { ...devices['Pixel 5'] } },
  ],
  webServer: {
    command: 'node tests/e2e/authentication/server.mjs',
    url: `http://localhost:${port}/login`,
    reuseExistingServer: false,
    timeout: 120000,
  },
})

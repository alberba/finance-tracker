import type { PlaywrightTestConfig } from '@playwright/test'
import { randomBytes } from 'node:crypto'
import { existsSync, mkdirSync, writeFileSync } from 'node:fs'
import { resolve } from 'node:path'
import { tmpdir } from 'node:os'
import { unstable_getVarsForDev, unstable_readConfig } from 'wrangler'
import { browserConnectionOptions, snapshotPathTemplate } from './playwright.browser'
import { DESIGN_COOKIE } from './src/lib/design'

type PlaywrightRuntimeOptions = {
  port: number
  htmlOutputFolder: string
  blobOutputDir: string
  tag: string
  runtime?: 'node' | 'worker'
  env?: Record<string, string>
}

const isCI = Boolean(process.env.CI)
const workerConfigId = (process.env.PLAYWRIGHT_WORKER_CONFIG_ID ??= randomBytes(8).toString('hex'))

// Each worktree gets its own port so parallel worktrees never collide on 4321.
// The offset is even, so configs whose base ports differ by one stay apart.
function worktreeOffset(): number {
  let hash = 0
  for (const char of process.cwd()) hash = (hash * 31 + char.charCodeAt(0)) >>> 0
  return 2 * (hash % 250)
}

// General E2E uses the same Worker and D1, with an isolated local auth origin.
// Production vars and the developer's .dev.vars are never rewritten.
function localWorkerConfig(port: number, baseURL: string): string {
  const config = unstable_readConfig({ config: 'wrangler.toml' }, { hideWarnings: true })
  const bindings = unstable_getVarsForDev(
    config.configPath,
    undefined,
    config.vars,
    undefined,
    true,
  )
  const secrets = Object.fromEntries(
    Object.entries(bindings)
      .filter(
        ([key, binding]) =>
          binding.type === 'secret_text' &&
          ['TWELVE_DATA_API_KEY', 'COINGECKO_API_KEY'].includes(key),
      )
      .map(([key, binding]) => [key, binding.value]),
  )
  const folder = resolve('.scratch', 'playwright', `${port}-${workerConfigId}`)
  mkdirSync(folder, { recursive: true, mode: 0o700 })
  const configPath = resolve(folder, 'wrangler.json')
  // Playwright workers reload this module; rewriting the config restarts Vite.
  if (existsSync(configPath) && existsSync(resolve(folder, '.dev.vars'))) return configPath
  writeFileSync(
    resolve(folder, '.dev.vars'),
    Object.entries({
      ...secrets,
      TEST_AUTH_ENABLED: 'true',
      BETTER_AUTH_SECRET: randomBytes(32).toString('hex'),
      DATA_ENCRYPTION_KEY: randomBytes(32).toString('base64'),
    })
      .map(([key, value]) => `${key}=${JSON.stringify(value)}`)
      .join('\n'),
    { mode: 0o600 },
  )
  writeFileSync(
    configPath,
    JSON.stringify({
      name: 'finance-tracker-e2e',
      main: config.main,
      compatibility_date: config.compatibility_date,
      compatibility_flags: config.compatibility_flags,
      d1_databases: config.d1_databases.map((database: { migrations_dir?: string }) => ({
        ...database,
        migrations_dir: resolve(database.migrations_dir ?? 'migrations-v2'),
      })),
      vars: { ...config.vars, BETTER_AUTH_URL: baseURL },
    }),
    { mode: 0o600 },
  )
  return configPath
}

export function createPlaywrightRuntime({
  port,
  htmlOutputFolder,
  blobOutputDir,
  tag,
  env,
  runtime = 'worker',
}: PlaywrightRuntimeOptions): PlaywrightTestConfig {
  const serverPort = isCI ? port : port + worktreeOffset()
  const localBaseURL = `http://127.0.0.1:${serverPort}`
  const externalBaseURL = process.env.PLAYWRIGHT_BASE_URL
  const baseURL = externalBaseURL ?? localBaseURL
  // D1 is disposable per invocation; Linux tmpfs avoids fsync for every fixture row.
  const persistPath = resolve(
    process.env.PLAYWRIGHT_STORAGE_DIR ??
      (process.platform === 'linux' && existsSync('/dev/shm') ? '/dev/shm' : tmpdir()),
    `finance-e2e-${workerConfigId}-${port}`,
  )
  if (!externalBaseURL) process.env.PLAYWRIGHT_PERSIST_PATH = persistPath
  const workerConfigPath = externalBaseURL ? undefined : localWorkerConfig(serverPort, localBaseURL)
  if (workerConfigPath) process.env.PLAYWRIGHT_WRANGLER_CONFIG = workerConfigPath
  const serverCommand = `node scripts/e2e-server.mjs ${serverPort}`

  return {
    tag,
    testDir: './tests/e2e',
    snapshotPathTemplate,
    outputDir: `test-results-${port}`,
    fullyParallel: false,
    globalSetup: './scripts/check-installed-dependencies.mjs',
    forbidOnly: isCI,
    failOnFlakyTests: isCI,
    retries: isCI ? 1 : 0,
    workers: process.env.CI ? 2 : 4,
    maxFailures: isCI ? 10 : 1,
    reporter: isCI
      ? [['dot'], ['blob', { outputDir: blobOutputDir }]]
      : [['list'], ['html', { open: 'never', outputFolder: htmlOutputFolder }]],
    use: {
      connectOptions: browserConnectionOptions,
      baseURL,
      // The new design is the default; the suites written for the old one keep
      // it with the cookie the toggle writes (ADR 0010). A spec for the new
      // design clears it: `test.use({ storageState: { cookies: [], origins: [] } })`.
      storageState: {
        cookies: [
          {
            name: DESIGN_COOKIE,
            value: 'legacy',
            domain: new URL(baseURL).hostname,
            path: '/',
            expires: -1,
            httpOnly: false,
            secure: false,
            sameSite: 'Lax' as const,
          },
        ],
        origins: [],
      },
      locale: 'en-US',
      timezoneId: 'UTC',
      extraHTTPHeaders: {
        'X-Test-User-Email': 'developer@e2e.test',
      },
      trace: 'retain-on-first-failure',
      screenshot: 'only-on-failure',
      video: {
        mode: 'on-first-retry',
        fps: 30,
        show: {
          actions: {
            cursor: 'pointer',
            style: {
              highlight: 'outline: 2px solid oklch(0.65 0.2 250)',
              title: 'font-size: 16px',
            },
          },
        },
      },
    },
    webServer: externalBaseURL
      ? undefined
      : {
          command: serverCommand,
          url: `${localBaseURL}/login`,
          reuseExistingServer: false,
          timeout: 120_000,
          gracefulShutdown: { signal: 'SIGTERM', timeout: 5_000 },
          env: {
            ...env,
            PLAYWRIGHT_RUNTIME: runtime,
            CLOUDFLARE_CONFIG_PATH: workerConfigPath!,
            CLOUDFLARE_PERSIST_PATH: persistPath,
          },
        },
  }
}

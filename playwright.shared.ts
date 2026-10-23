import type { PlaywrightTestConfig } from '@playwright/test'
import { randomBytes } from 'node:crypto'
import { existsSync, mkdirSync, writeFileSync } from 'node:fs'
import { resolve } from 'node:path'
import { unstable_getVarsForDev, unstable_readConfig } from 'wrangler'

type PlaywrightRuntimeOptions = {
  port: number
  htmlOutputFolder: string
  blobOutputDir: string
  tag: string
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
}: PlaywrightRuntimeOptions): PlaywrightTestConfig {
  const serverPort = isCI ? port : port + worktreeOffset()
  const localBaseURL = `http://127.0.0.1:${serverPort}`
  const externalBaseURL = process.env.PLAYWRIGHT_BASE_URL
  // --ignore-lock: Astro allows one dev server per project root, and the user's
  // `pnpm dev` in this worktree must keep running alongside the test server.
  const serverCommand = `pnpm d1:migrate:local:v2 && ASTRO_DEV_BACKGROUND=0 pnpm dev --host 127.0.0.1 --port ${serverPort} --ignore-lock`

  return {
    tag,
    testDir: './tests/e2e',
    fullyParallel: false,
    globalSetup: './scripts/check-installed-dependencies.mjs',
    forbidOnly: isCI,
    retries: isCI ? 1 : 0,
    workers: 1,
    maxFailures: isCI ? 10 : 1,
    reporter: isCI
      ? [['dot'], ['blob', { outputDir: blobOutputDir }]]
      : [['list'], ['html', { open: 'never', outputFolder: htmlOutputFolder }]],
    use: {
      baseURL: externalBaseURL ?? localBaseURL,
      extraHTTPHeaders: {
        'X-Test-User-Email': 'developer@e2e.test',
      },
      trace: 'on-first-retry',
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
            CLOUDFLARE_CONFIG_PATH: localWorkerConfig(serverPort, localBaseURL),
            CLOUDFLARE_PERSIST_PATH: resolve('.wrangler/state'),
          },
        },
  }
}

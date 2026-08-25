import type { PlaywrightTestConfig } from '@playwright/test'

type PlaywrightRuntimeOptions = {
  port: number
  htmlOutputFolder: string
  blobOutputDir: string
  tag: string
  env?: Record<string, string>
}

const isCI = Boolean(process.env.CI)

export function createPlaywrightRuntime({
  port,
  htmlOutputFolder,
  blobOutputDir,
  tag,
  env,
}: PlaywrightRuntimeOptions): PlaywrightTestConfig {
  const localBaseURL = `http://127.0.0.1:${port}`
  const externalBaseURL = process.env.PLAYWRIGHT_BASE_URL
  const useProductionBuild = isCI || process.env.PLAYWRIGHT_USE_BUILD === 'true'
  const serverCommand = useProductionBuild
    ? `pnpm d1:migrate:local && pnpm d1:migrate:local:v2 && SENTRY_AUTH_TOKEN= pnpm build && pnpm exec wrangler dev --config dist/server/wrangler.json --persist-to .wrangler/state --ip 127.0.0.1 --port ${port} --compatibility-flag nodejs_compat`
    : `pnpm d1:migrate:local && pnpm d1:migrate:local:v2 && ASTRO_DEV_BACKGROUND=0 pnpm dev --host 127.0.0.1 --port ${port}`

  return {
    tag,
    testDir: './tests/e2e',
    fullyParallel: true,
    forbidOnly: isCI,
    retries: isCI ? 2 : 0,
    workers: isCI ? 4 : 2,
    maxFailures: isCI ? 10 : 1,
    reporter: isCI
      ? [['dot'], ['blob', { outputDir: blobOutputDir }]]
      : [['list'], ['html', { open: 'never', outputFolder: htmlOutputFolder }]],
    use: {
      baseURL: externalBaseURL ?? localBaseURL,
      extraHTTPHeaders: {
        'X-Test-User-Email': 'legacy-owner@e2e.test',
      },
      trace: 'on-first-retry',
      screenshot: 'only-on-failure',
      video: 'on-first-retry',
    },
    webServer: externalBaseURL
      ? undefined
      : {
          command: serverCommand,
          url: localBaseURL,
          reuseExistingServer: false,
          timeout: 120_000,
          gracefulShutdown: { signal: 'SIGTERM', timeout: 5_000 },
          env,
        },
  }
}

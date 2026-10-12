import type { PlaywrightTestConfig } from '@playwright/test'

type PlaywrightRuntimeOptions = {
  port: number
  htmlOutputFolder: string
  blobOutputDir: string
  tag: string
  env?: Record<string, string>
}

const isCI = Boolean(process.env.CI)

// Each worktree gets its own port so parallel worktrees never collide on 4321.
// The offset is even, so configs whose base ports differ by one stay apart.
function worktreeOffset(): number {
  let hash = 0
  for (const char of process.cwd()) hash = (hash * 31 + char.charCodeAt(0)) >>> 0
  return 2 * (hash % 250)
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
    retries: isCI ? 2 : 0,
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
      video: 'on-first-retry',
    },
    webServer: externalBaseURL
      ? undefined
      : {
          command: serverCommand,
          url: `${localBaseURL}/login`,
          reuseExistingServer: false,
          timeout: 120_000,
          gracefulShutdown: { signal: 'SIGTERM', timeout: 5_000 },
          env,
        },
  }
}

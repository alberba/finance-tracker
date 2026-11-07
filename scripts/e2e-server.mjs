import { spawn, spawnSync } from 'node:child_process'
import { copyFileSync, mkdirSync, readFileSync, rmSync } from 'node:fs'
import { dirname, resolve } from 'node:path'

const persistPath = process.env.CLOUDFLARE_PERSIST_PATH
const configPath = process.env.CLOUDFLARE_CONFIG_PATH
if (!persistPath || !configPath) {
  throw new Error('Start this server through a Playwright configuration.')
}
process.on('exit', () => rmSync(persistPath, { recursive: true, force: true }))
const port = process.argv[2]
const nodeRuntime = process.env.PLAYWRIGHT_RUNTIME === 'node'
const output = resolve('.scratch/playwright', `build-${port}`)
const config = JSON.parse(readFileSync(configPath, 'utf8'))
const secrets = Object.fromEntries(
  readFileSync(resolve(dirname(configPath), '.dev.vars'), 'utf8')
    .split('\n')
    .filter(Boolean)
    .map((line) => {
      const separator = line.indexOf('=')
      return [line.slice(0, separator), JSON.parse(line.slice(separator + 1))]
    }),
)
const env = {
  ...process.env,
  ...config.vars,
  ...secrets,
  DEPLOY_TARGET: nodeRuntime ? 'node' : 'cloudflare',
  SQLITE_PATH: resolve(persistPath, 'finance.sqlite'),
  PLAYWRIGHT_BUILD_DIR: output,
  PLAYWRIGHT_VITE_CACHE_DIR: resolve('.scratch/playwright', `vite-${port}`),
  HOST: '127.0.0.1',
  PORT: port,
}
if (nodeRuntime) {
  const { default: Database } = await import('better-sqlite3')
  const { migrateLocalDatabase } = await import('./local-init.mjs')
  mkdirSync(persistPath, { recursive: true })
  const sqlite = new Database(env.SQLITE_PATH)
  try {
    migrateLocalDatabase(sqlite)
  } finally {
    sqlite.close()
  }
} else {
  const migration = spawnSync(
    'pnpm',
    [
      'exec',
      'wrangler',
      'd1',
      'migrations',
      'apply',
      'finance-tracker-db-v2',
      '--local',
      '--persist-to',
      persistPath,
      '--config',
      configPath,
    ],
    { stdio: 'inherit' },
  )
  if (migration.status !== 0) process.exit(migration.status ?? 1)
}
const build = spawnSync('pnpm', ['build'], { stdio: 'inherit', env })
if (build.status !== 0) process.exit(build.status ?? 1)
if (!nodeRuntime) {
  copyFileSync(resolve(dirname(configPath), '.dev.vars'), resolve(output, 'server/.dev.vars'))
}
const server = nodeRuntime
  ? spawn(process.execPath, [resolve(output, 'server/entry.mjs')], { stdio: 'inherit', env })
  : spawn(
      'pnpm',
      [
        'exec',
        'wrangler',
        'dev',
        '--config',
        resolve(output, 'server/wrangler.json'),
        '--ip',
        '127.0.0.1',
        '--port',
        port,
        '--persist-to',
        persistPath,
        '--local',
      ],
      { stdio: 'inherit', env },
    )
for (const signal of ['SIGTERM', 'SIGINT']) process.on(signal, () => server.kill(signal))
server.on('exit', (code) => {
  process.exitCode = code ?? 1
})

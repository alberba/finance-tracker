import Database from 'better-sqlite3'
import { mkdtemp, mkdir, realpath, rm, writeFile } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import { join, resolve } from 'node:path'
import { once } from 'node:events'
import { createServer, type ViteDevServer } from 'vite'
import { afterAll, beforeAll, expect, it, vi } from 'vitest'

let root: string
let databasePath: string
let sourcePath: string
let server: ViteDevServer | undefined
let sqlite: Database.Database | undefined

beforeAll(async () => {
  root = await realpath(await mkdtemp(join(tmpdir(), 'finance-dev-watch-')))
  databasePath = join(root, 'data', 'finance.sqlite')
  sourcePath = join(root, 'src', 'view.ts')
  await mkdir(join(root, 'data'))
  await mkdir(join(root, 'src'))
  await writeFile(sourcePath, 'export const title = "Settings"')
  sqlite = new Database(databasePath)
  sqlite.pragma('journal_mode = WAL')
  sqlite.exec('CREATE TABLE changes (id INTEGER PRIMARY KEY)')
  vi.stubEnv('DEPLOY_TARGET', 'node')
  vi.stubEnv('SQLITE_PATH', databasePath)
  const { default: config } = await import('../../astro.config')
  server = await createServer({
    configFile: false,
    root,
    server: { middlewareMode: true, watch: config.vite?.server?.watch },
  })
  // Vite can finish the watcher's initial scan before createServer resolves.
  // Observe the watched source instead of waiting for an already-fired event.
  await vi.waitFor(() => {
    expect(server?.watcher.getWatched()[join(root, 'src')]).toContain('view.ts')
  })
})

it('keeps SQLite writes out of hot reload while still watching source files', async () => {
  const watched = new Set(
    Object.entries(server!.watcher.getWatched()).flatMap(([directory, files]) =>
      files.map((file) => resolve(directory, file)),
    ),
  )
  for (const suffix of ['', '-wal', '-shm']) {
    expect(
      watched.has(`${databasePath}${suffix}`),
      `SQLite ${suffix || 'database'} is watched`,
    ).toBe(false)
  }
  expect(watched.has(sourcePath)).toBe(true)
  const sourceChange = once(server!.watcher, 'change')
  sqlite!.exec('INSERT INTO changes DEFAULT VALUES')
  await writeFile(sourcePath, 'export const title = "Updated settings"')
  expect((await sourceChange)[0]).toBe(sourcePath)
})

afterAll(async () => {
  await server?.close()
  sqlite?.close()
  vi.unstubAllEnvs()
  await rm(root, { recursive: true, force: true })
})

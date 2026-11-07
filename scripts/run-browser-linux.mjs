import { spawn, spawnSync } from 'node:child_process'
import { randomUUID } from 'node:crypto'
import { createRequire } from 'node:module'
import { createServer } from 'node:net'

const readPackage = createRequire(import.meta.url)
const version = readPackage('@playwright/test/package.json').version
const name = `finance-browser-${randomUUID()}`
const socket = createServer()
await new Promise((resolve, reject) => {
  socket.once('error', reject)
  socket.listen(0, '127.0.0.1', resolve)
})
const port = socket.address().port
await new Promise((resolve) => socket.close(resolve))
const docker = spawn(
  'docker',
  [
    'run',
    '--rm',
    '--init',
    '--name',
    name,
    '--shm-size=1g',
    '--user',
    `${process.getuid()}:${process.getgid()}`,
    '-v',
    `${process.cwd()}:${process.cwd()}`,
    '-w',
    process.cwd(),
    '-p',
    `127.0.0.1:${port}:3000`,
    '-e',
    'XDG_CONFIG_HOME=/tmp/config',
    '-e',
    'XDG_CACHE_HOME=/tmp/cache',
    `mcr.microsoft.com/playwright:v${version}-noble`,
    'node',
    'node_modules/@playwright/test/cli.js',
    'run-server',
    '--host',
    '0.0.0.0',
    '--port',
    '3000',
    '--unsafe',
  ],
  { stdio: ['ignore', 'pipe', 'inherit'] },
)
try {
  await new Promise((resolve, reject) => {
    const timeout = setTimeout(
      () => reject(new Error('Linux browser did not start in 60s')),
      60_000,
    )
    const finish = (error) => {
      clearTimeout(timeout)
      if (error) reject(error)
      else resolve()
    }
    docker.once('error', finish)
    docker.once('exit', (code) => finish(new Error(`Linux browser exited: ${code}`)))
    docker.stdout.on('data', (chunk) => {
      if (chunk.toString().includes('Listening on ws://')) finish()
    })
  })
  // Tests, app servers and native SQLite stay on the host. Only Chromium runs
  // in Linux; Playwright exposes the client's loopback network to it.
  const [command, ...args] = process.argv.slice(2)
  const result = spawnSync(command, args, {
    stdio: 'inherit',
    env: { ...process.env, PLAYWRIGHT_WS_ENDPOINT: `ws://127.0.0.1:${port}/` },
  })
  if (result.error) console.error(result.error.message)
  process.exitCode = result.status ?? 1
} finally {
  spawnSync('docker', ['stop', '--time', '3', name], { stdio: 'ignore' })
  docker.kill('SIGTERM')
}

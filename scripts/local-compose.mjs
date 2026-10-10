import { createHash } from 'node:crypto'
import { execFileSync, spawnSync } from 'node:child_process'
import { existsSync, mkdirSync, readFileSync, realpathSync, writeFileSync } from 'node:fs'
import { createServer } from 'node:net'
import { basename, resolve } from 'node:path'
import { pathToFileURL } from 'node:url'

export function preferredPort(checkout, mainCheckout) {
  if (checkout === mainCheckout) return 4321
  const hash = createHash('sha256').update(checkout).digest('hex')
  return 20000 + (Number.parseInt(hash.slice(0, 8), 16) % 10000)
}

export async function availablePort(preferred) {
  for (let port = preferred; port <= 65535; port++) {
    const free = await new Promise((resolvePort, reject) => {
      const server = createServer()
      server.once('error', (error) => {
        if (error.code === 'EADDRINUSE') resolvePort(false)
        else reject(error)
      })
      server.listen(port, '127.0.0.1', () => server.close(() => resolvePort(true)))
    })
    if (free) return port
  }
  throw new Error('No hay un puerto local disponible para este worktree.')
}

export function projectName(checkout, mainCheckout) {
  const name =
    basename(checkout)
      .toLowerCase()
      .replace(/[^a-z0-9_-]/g, '-')
      .replace(/^[^a-z0-9]+/, '') || 'finance-tracker'
  return checkout === mainCheckout
    ? name
    : `${name}-${createHash('sha256').update(checkout).digest('hex').slice(0, 12)}`
}

export function checkoutProject(checkout, mainCheckout) {
  const file = resolve(checkout, '.data/selfhost-project')
  if (existsSync(file)) {
    try {
      const saved = JSON.parse(readFileSync(file, 'utf8'))
      if (
        saved.checkout === checkout &&
        (saved.project === projectName(checkout, mainCheckout) ||
          saved.project ===
            basename(checkout)
              .toLowerCase()
              .replace(/[^a-z0-9_-]/g, '')) &&
        (checkout === mainCheckout || saved.project !== projectName(mainCheckout, mainCheckout))
      )
        return saved.project
    } catch {
      // Older releases stored only the name; recover it from container ownership.
    }
  }
  const legacy = basename(checkout)
    .toLowerCase()
    .replace(/[^a-z0-9_-]/g, '')
  try {
    const owner = execFileSync(
      'docker',
      [
        'inspect',
        `${legacy}-app-1`,
        '--format',
        '{{index .Config.Labels "com.docker.compose.project.working_dir"}}',
      ],
      { encoding: 'utf8', stdio: ['ignore', 'pipe', 'ignore'] },
    ).trim()
    if (
      owner === checkout &&
      (checkout === mainCheckout || legacy !== projectName(mainCheckout, mainCheckout))
    )
      return legacy
  } catch {
    // New worktrees have no legacy container.
  }
  return projectName(checkout, mainCheckout)
}

async function run(action) {
  if (!['up', 'down'].includes(action)) throw new Error('Usa local-compose.mjs up o down.')
  execFileSync(process.execPath, ['scripts/setup-local.mjs'], { stdio: 'inherit' })
  const checkout = process.cwd()
  const mainCheckout = primaryCheckout(checkout)
  const project = checkoutProject(checkout, mainCheckout)
  const compose = ['compose', '--project-name', project]
  mkdirSync(resolve('.data'), { recursive: true })
  writeFileSync(resolve('.data/selfhost-project'), `${JSON.stringify({ project, checkout })}\n`)
  if (action === 'down') {
    execFileSync('docker', [...compose, 'down'], { stdio: 'inherit' })
    return
  }
  execFileSync('docker', [...compose, 'build'], { stdio: 'inherit' })
  const portFile = resolve('.data/selfhost-port')
  let preferred = existsSync(portFile)
    ? Number(readFileSync(portFile, 'utf8'))
    : preferredPort(checkout, mainCheckout)
  if (!Number.isInteger(preferred) || preferred < 1 || preferred > 65535)
    preferred = preferredPort(checkout, mainCheckout)
  let runningPort
  try {
    runningPort = execFileSync('docker', [...compose, 'port', 'app', '4321'], {
      encoding: 'utf8',
      stdio: ['ignore', 'pipe', 'ignore'],
    })
      .trim()
      .split(':')
      .at(-1)
  } catch {
    // A stopped or new service has no published port to reuse.
  }
  const port = await startCompose(compose, preferred, runningPort)
  writeFileSync(portFile, `${port}\n`)
  console.log(`Aplicación de este worktree: http://localhost:${port}/login`)
}

export function primaryCheckout(checkout) {
  return realpathSync(
    execFileSync('git', ['-C', checkout, 'worktree', 'list', '--porcelain', '-z'], {
      encoding: 'utf8',
    })
      .split('\0')[0]
      .slice('worktree '.length),
  )
}

export async function startCompose(compose, preferred, runningPort) {
  let port = preferred
  for (let attempt = 0; attempt < 5; attempt++) {
    port = attempt === 0 && runningPort ? Number(runningPort) : await availablePort(port)
    const url = `http://localhost:${port}`
    const result = spawnSync('docker', [...compose, 'up', '--no-build', '-d', '--wait'], {
      encoding: 'utf8',
      stdio: ['inherit', 'inherit', 'pipe'],
      env: { ...process.env, LOCAL_PORT: String(port), BETTER_AUTH_URL: url },
    })
    if (result.stderr) process.stderr.write(result.stderr)
    if (result.error) throw result.error
    if (result.status === 0) {
      return port
    }
    if (!/port is already allocated|address already in use/i.test(result.stderr || ''))
      throw new Error('Docker Compose no pudo arrancar la aplicación.')
    port++
  }
  throw new Error('Otro proceso ocupó el puerto durante el arranque; vuelve a ejecutar local:up.')
}

if (process.argv[1] && import.meta.url === pathToFileURL(resolve(process.argv[1])).href) {
  run(process.argv[2]).catch((error) => {
    console.error(error.message)
    process.exitCode = 1
  })
}

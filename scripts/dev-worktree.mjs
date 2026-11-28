import { spawn } from 'node:child_process'
import { existsSync, readFileSync, realpathSync, writeFileSync } from 'node:fs'
import { resolve } from 'node:path'
import { pathToFileURL } from 'node:url'
import { availablePort, preferredPort, primaryCheckout } from './local-compose.mjs'

export function upsertEnvVar(content, key, value) {
  const line = `${key}=${value}`
  const pattern = new RegExp(`^${key}=.*$`, 'm')
  if (pattern.test(content)) return content.replace(pattern, line)
  return `${content}${content === '' || content.endsWith('\n') ? '' : '\n'}${line}\n`
}

/** The port a launcher asked for through `PORT`, or null when it is unset or not a valid port. */
export function requestedPort(value) {
  const port = Number(value)
  return Number.isInteger(port) && port >= 1 && port <= 65535 ? port : null
}

/** Better Auth valida origen, cookies y passkeys contra esta URL: debe coincidir con el puerto. */
function writeAuthUrl(port) {
  const devVars = resolve('.dev.vars')
  if (!existsSync(devVars)) throw new Error('Falta .dev.vars: ejecuta bun run setup:worktree.')
  const current = readFileSync(devVars, 'utf8')
  const next = upsertEnvVar(current, 'BETTER_AUTH_URL', `http://localhost:${port}`)
  if (next !== current) writeFileSync(devVars, next)
}

async function run(extraArgs) {
  const checkout = realpathSync(process.cwd())
  const own = preferredPort(checkout, primaryCheckout(checkout))
  // `--sync-url` (bun run setup:worktree) solo fija la URL con el puerto propio del worktree: no
  // arranca nada, ignora `PORT` y no la cambia por un puerto ocupado de un servidor en marcha.
  if (extraArgs[0] === '--sync-url') return writeAuthUrl(own)
  // `PORT` lo fija quien lanza el servidor (la vista previa de `.claude/launch.json` con autoPort).
  const port = await availablePort(requestedPort(process.env.PORT) ?? own)
  writeAuthUrl(port)
  console.log(`Servidor de desarrollo en http://localhost:${port}`)
  const child = spawn('bun', ['run', 'dev', '--port', String(port), '--strictPort', ...extraArgs], {
    stdio: 'inherit',
  })
  child.on('exit', (code, signal) => {
    process.exitCode = signal ? 1 : (code ?? 0)
  })
}

if (process.argv[1] && import.meta.url === pathToFileURL(resolve(process.argv[1])).href) {
  run(process.argv.slice(2)).catch((error) => {
    console.error(error.message)
    process.exitCode = 1
  })
}

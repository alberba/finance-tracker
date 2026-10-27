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

async function run(extraArgs) {
  const checkout = realpathSync(process.cwd())
  const port = await availablePort(preferredPort(checkout, primaryCheckout(checkout)))
  const devVars = resolve('.dev.vars')
  if (!existsSync(devVars)) throw new Error('Falta .dev.vars: ejecuta pnpm setup:worktree.')
  // Better Auth valida origen, cookies y passkeys contra esta URL: debe coincidir con el puerto.
  const current = readFileSync(devVars, 'utf8')
  const next = upsertEnvVar(current, 'BETTER_AUTH_URL', `http://localhost:${port}`)
  if (next !== current) writeFileSync(devVars, next)
  console.log(`Servidor de desarrollo en http://localhost:${port}`)
  const child = spawn('pnpm', ['dev', '--port', String(port), '--strictPort', ...extraArgs], {
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

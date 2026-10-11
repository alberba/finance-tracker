import { execFileSync } from 'node:child_process'
import { realpathSync } from 'node:fs'
import { resolve } from 'node:path'
import { pathToFileURL } from 'node:url'
import { checkoutProject, primaryCheckout } from './local-compose.mjs'

export function archiveLocal(checkout) {
  checkout = realpathSync(checkout)
  const mainCheckout = primaryCheckout(checkout)
  if (checkout === mainCheckout)
    throw new Error('El archivado no elimina los datos del checkout principal.')
  const project = checkoutProject(checkout, mainCheckout)
  if (project === checkoutProject(mainCheckout, mainCheckout))
    throw new Error('El proyecto Docker pertenece al checkout principal.')
  const docker = (args) => execFileSync('docker', args, { encoding: 'utf8' }).trim()
  const filter = ['--filter', `label=com.docker.compose.project=${project}`]
  const containers = docker(['ps', '-aq', ...filter])
    .split('\n')
    .filter(Boolean)
  for (const container of containers) {
    const owner = docker([
      'inspect',
      container,
      '--format',
      '{{index .Config.Labels "com.docker.compose.project.working_dir"}}',
    ])
    if (owner !== checkout) throw new Error(`El contenedor ${container} pertenece a otro checkout.`)
  }
  if (containers.length) docker(['rm', '-f', ...containers])
  const volumes = docker(['volume', 'ls', '-q', ...filter])
    .split('\n')
    .filter(Boolean)
  if (volumes.length) docker(['volume', 'rm', ...volumes])
  const networks = docker(['network', 'ls', '-q', ...filter])
    .split('\n')
    .filter(Boolean)
  if (networks.length) docker(['network', 'rm', ...networks])
  const image = `${project}-app:latest`
  if (docker(['image', 'ls', '-q', image])) docker(['image', 'rm', '--force', image])
  console.log(`Recursos Docker archivados: ${project}`)
}

if (process.argv[1] && import.meta.url === pathToFileURL(resolve(process.argv[1])).href) {
  try {
    archiveLocal(resolve(process.argv[2] || process.env.ORCA_WORKTREE_PATH || process.cwd()))
  } catch (error) {
    console.error(error.message)
    process.exitCode = 1
  }
}

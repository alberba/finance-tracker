import { copyFile, readFile } from 'node:fs/promises'
import { pathToFileURL } from 'node:url'

// Bun does not keep a copy of the lockfile it installed, so the root `postinstall` records one
// (`--record`) and the check compares it with the current `bun.lock`.
const INSTALLED_LOCKFILE = 'node_modules/.installed-bun.lock'

export default async function checkInstalledDependencies() {
  const [expected, installed] = await Promise.all([
    readFile('bun.lock', 'utf8'),
    readFile(INSTALLED_LOCKFILE, 'utf8').catch(() => ''),
  ])
  if (expected !== installed) {
    throw new Error('Dependencias desactualizadas: ejecuta bun install --frozen-lockfile.')
  }
}

if (process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href) {
  if (process.argv.includes('--record')) await copyFile('bun.lock', INSTALLED_LOCKFILE)
  else await checkInstalledDependencies()
}

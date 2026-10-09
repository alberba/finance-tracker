import { readFile } from 'node:fs/promises'
import { pathToFileURL } from 'node:url'

export default async function checkInstalledDependencies() {
  const [expected, installed] = await Promise.all([
    readFile('pnpm-lock.yaml', 'utf8'),
    readFile('node_modules/.pnpm/lock.yaml', 'utf8').catch(() => ''),
  ])
  if (expected !== installed) {
    throw new Error('Dependencias desactualizadas: ejecuta pnpm install --frozen-lockfile.')
  }
}

if (process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href) {
  await checkInstalledDependencies()
}

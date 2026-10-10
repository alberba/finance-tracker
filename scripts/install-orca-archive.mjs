import { copyFileSync, mkdirSync } from 'node:fs'
import { dirname, resolve } from 'node:path'
import { fileURLToPath } from 'node:url'
import { primaryCheckout } from './local-compose.mjs'

const scripts = dirname(fileURLToPath(import.meta.url))
const destination = resolve(primaryCheckout(process.cwd()), '.data/orca')
mkdirSync(destination, { recursive: true })
for (const file of ['archive-local.mjs', 'local-compose.mjs']) {
  copyFileSync(resolve(scripts, file), resolve(destination, file))
}
console.log(`Script de archivado instalado: ${destination}/archive-local.mjs`)

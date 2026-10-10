import { randomBytes } from 'node:crypto'
import { existsSync, writeFileSync } from 'node:fs'

const path = '.env.selfhost'
if (existsSync(path)) {
  console.log(`${path} ya existe; se conserva la configuración.`)
} else {
  writeFileSync(
    path,
    [
      'BETTER_AUTH_URL=http://localhost:4321',
      `BETTER_AUTH_SECRET=${randomBytes(32).toString('hex')}`,
      `DATA_ENCRYPTION_KEY=${randomBytes(32).toString('base64')}`,
      'LOCAL_ADMIN_EMAIL=local@example.test',
      `LOCAL_ADMIN_PASSWORD=${randomBytes(24).toString('hex')}`,
      '',
    ].join('\n'),
    { mode: 0o600, flag: 'wx' },
  )
  console.log(`Configuración creada en ${path}. Consulta allí el correo y la contraseña de acceso.`)
}

import { randomBytes } from 'node:crypto'
import { execFileSync } from 'node:child_process'
import {
  chmodSync,
  constants,
  copyFileSync,
  existsSync,
  lstatSync,
  realpathSync,
  symlinkSync,
  unlinkSync,
  writeFileSync,
} from 'node:fs'
import { resolve } from 'node:path'

const mainCheckout = execFileSync('git', ['worktree', 'list', '--porcelain', '-z'], {
  encoding: 'utf8',
})
  .split('\0')[0]
  .slice('worktree '.length)
const path = resolve(mainCheckout, '.env.selfhost')
const worktreePath = resolve('.env.selfhost')
if (!existsSync(path) && existsSync(worktreePath)) {
  copyFileSync(worktreePath, path, constants.COPYFILE_EXCL)
  chmodSync(path, 0o600)
}
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

if (worktreePath !== path) {
  const worktreeEntry = lstatSync(worktreePath, { throwIfNoEntry: false })
  if (worktreeEntry?.isSymbolicLink() && !existsSync(worktreePath)) unlinkSync(worktreePath)
  if (existsSync(worktreePath) && realpathSync(worktreePath) !== realpathSync(path)) {
    let backup = `${worktreePath}.local`
    for (let suffix = 1; lstatSync(backup, { throwIfNoEntry: false }); suffix++) {
      backup = `${worktreePath}.local.${suffix}`
    }
    copyFileSync(worktreePath, backup, constants.COPYFILE_EXCL)
    chmodSync(backup, 0o600)
    unlinkSync(worktreePath)
    console.log(`Configuración propia del worktree conservada en ${backup}.`)
  }
  if (!existsSync(worktreePath)) {
    symlinkSync(path, worktreePath)
    console.log(`.env.selfhost enlazado a la configuración compartida de ${mainCheckout}.`)
  }
}

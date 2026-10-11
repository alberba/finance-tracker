import { execFileSync } from 'node:child_process'
import {
  mkdtempSync,
  readFileSync,
  realpathSync,
  rmSync,
  statSync,
  symlinkSync,
  writeFileSync,
} from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { fileURLToPath } from 'node:url'
import { afterEach, beforeEach, describe, expect, it } from 'vitest'

const setupScript = fileURLToPath(new URL('../../scripts/setup-local.mjs', import.meta.url))
let directory: string
let worktree: string

function git(...args: string[]): void {
  execFileSync('git', args, { cwd: directory, stdio: 'ignore' })
}

function setup(): void {
  execFileSync(process.execPath, [setupScript], { cwd: worktree, stdio: 'ignore' })
}

beforeEach(() => {
  directory = mkdtempSync(join(tmpdir(), 'finance shared env '))
  git('init', '--initial-branch=main')
  git(
    '-c',
    'user.name=Test',
    '-c',
    'user.email=test@example.test',
    'commit',
    '--allow-empty',
    '-m',
    'init',
  )
  worktree = join(directory, 'feature worktree')
  git('worktree', 'add', '-b', 'feature', worktree)
})

afterEach(() => {
  rmSync(directory, { recursive: true, force: true })
})

describe('local environment setup', () => {
  it('links the worktree to the primary checkout configuration', () => {
    const shared = join(directory, '.env.selfhost')
    writeFileSync(shared, 'LOCAL_ADMIN_EMAIL=shared@example.test\n')

    setup()

    expect(realpathSync(join(worktree, '.env.selfhost'))).toBe(realpathSync(shared))
  })

  it('keeps the shared link when setup runs again', () => {
    const shared = join(directory, '.env.selfhost')
    writeFileSync(shared, 'LOCAL_ADMIN_EMAIL=shared@example.test\n')
    setup()

    setup()

    expect(realpathSync(join(worktree, '.env.selfhost'))).toBe(realpathSync(shared))
  })

  it('propagates edits to the shared configuration', () => {
    const shared = join(directory, '.env.selfhost')
    writeFileSync(shared, 'LOCAL_ADMIN_EMAIL=shared@example.test\n')
    setup()

    writeFileSync(shared, 'LOCAL_ADMIN_EMAIL=updated@example.test\n')

    expect(readFileSync(join(worktree, '.env.selfhost'), 'utf8')).toBe(
      'LOCAL_ADMIN_EMAIL=updated@example.test\n',
    )
  })

  it('creates private shared configuration when first run from a worktree', () => {
    setup()

    const shared = join(directory, '.env.selfhost')
    expect(statSync(shared).mode & 0o777).toBe(0o600)
  })

  it('preserves an existing worktree configuration before switching to the shared one', () => {
    writeFileSync(join(directory, '.env.selfhost'), 'LOCAL_ADMIN_EMAIL=shared@example.test\n')
    writeFileSync(join(worktree, '.env.selfhost'), 'LOCAL_ADMIN_EMAIL=private@example.test\n')

    setup()

    expect(readFileSync(join(worktree, '.env.selfhost.local'), 'utf8')).toBe(
      'LOCAL_ADMIN_EMAIL=private@example.test\n',
    )
  })

  it('reuses existing credentials when the primary checkout has no configuration yet', () => {
    writeFileSync(join(worktree, '.env.selfhost'), 'LOCAL_ADMIN_EMAIL=existing@example.test\n')

    setup()

    expect(readFileSync(join(directory, '.env.selfhost'), 'utf8')).toBe(
      'LOCAL_ADMIN_EMAIL=existing@example.test\n',
    )
  })

  it('repairs a link whose former checkout no longer exists', () => {
    const shared = join(directory, '.env.selfhost')
    writeFileSync(shared, 'LOCAL_ADMIN_EMAIL=shared@example.test\n')
    symlinkSync(join(directory, 'old checkout', '.env.selfhost'), join(worktree, '.env.selfhost'))

    setup()

    expect(realpathSync(join(worktree, '.env.selfhost'))).toBe(realpathSync(shared))
  })

  it('preserves earlier backups when a worktree has another private configuration', () => {
    writeFileSync(join(directory, '.env.selfhost'), 'LOCAL_ADMIN_EMAIL=shared@example.test\n')
    writeFileSync(join(worktree, '.env.selfhost'), 'LOCAL_ADMIN_EMAIL=private@example.test\n')
    writeFileSync(join(worktree, '.env.selfhost.local'), 'LOCAL_ADMIN_EMAIL=older@example.test\n')

    setup()

    expect(readFileSync(join(worktree, '.env.selfhost.local'), 'utf8')).toBe(
      'LOCAL_ADMIN_EMAIL=older@example.test\n',
    )
    expect(readFileSync(join(worktree, '.env.selfhost.local.1'), 'utf8')).toBe(
      'LOCAL_ADMIN_EMAIL=private@example.test\n',
    )
  })
})

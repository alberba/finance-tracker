import { describe, expect, it } from 'vitest'
import { upsertEnvVar } from '../../scripts/dev-worktree.mjs'

describe('upsertEnvVar', () => {
  it('replaces an existing value and keeps the other lines', () => {
    const content = 'A=1\nBETTER_AUTH_URL=http://localhost:4321\nB=2\n'
    expect(upsertEnvVar(content, 'BETTER_AUTH_URL', 'http://localhost:23456')).toBe(
      'A=1\nBETTER_AUTH_URL=http://localhost:23456\nB=2\n',
    )
  })

  it('appends the variable when it is missing, with or without a trailing newline', () => {
    expect(upsertEnvVar('A=1\n', 'K', 'v')).toBe('A=1\nK=v\n')
    expect(upsertEnvVar('A=1', 'K', 'v')).toBe('A=1\nK=v\n')
    expect(upsertEnvVar('', 'K', 'v')).toBe('K=v\n')
  })

  it('does not touch variables that merely start with the same name', () => {
    expect(upsertEnvVar('K_OTHER=1\n', 'K', 'v')).toBe('K_OTHER=1\nK=v\n')
  })
})

import { createServer } from 'node:net'
import { spawnSync } from 'node:child_process'
import { mkdtempSync, mkdirSync, writeFileSync, rmSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { describe, expect, it, vi } from 'vitest'
import {
  availablePort,
  preferredPort,
  projectName,
  startCompose,
  checkoutProject,
} from '../../scripts/local-compose.mjs'

vi.mock('node:child_process', async (importOriginal) => ({
  ...(await importOriginal<typeof import('node:child_process')>()),
  spawnSync: vi.fn(),
}))

describe('local Compose ports', () => {
  it('retries a Compose bind collision with the next port and matching auth origin', async () => {
    const stderr = vi.spyOn(process.stderr, 'write').mockReturnValue(true)
    const spawn = vi.mocked(spawnSync)
    spawn.mockReturnValueOnce({
      status: 1,
      stderr: 'port is already allocated',
      stdout: '',
      pid: 1,
      output: [],
      signal: null,
    })
    spawn.mockReturnValueOnce({
      status: 0,
      stderr: '',
      stdout: '',
      pid: 1,
      output: [],
      signal: null,
    })
    const port = await startCompose(['compose', '--project-name', 'test'], 32000, '32000')
    expect(port).toBeGreaterThan(32000)
    expect(spawn).toHaveBeenLastCalledWith(
      'docker',
      ['compose', '--project-name', 'test', 'up', '--no-build', '-d', '--wait'],
      expect.objectContaining({
        env: expect.objectContaining({
          LOCAL_PORT: String(port),
          BETTER_AUTH_URL: `http://localhost:${port}`,
        }),
      }),
    )
    expect(stderr).toHaveBeenCalledExactlyOnceWith('port is already allocated')
    stderr.mockRestore()
    spawn.mockReset()
  })

  it('ignores project metadata copied from another checkout', () => {
    const checkout = mkdtempSync(join(tmpdir(), 'finance-project-'))
    try {
      mkdirSync(join(checkout, '.data'))
      writeFileSync(
        join(checkout, '.data/selfhost-project'),
        JSON.stringify({ checkout: '/other', project: 'finance-tracker' }),
      )
      expect(checkoutProject(checkout, '/repo')).toBe(projectName(checkout, '/repo'))
    } finally {
      rmSync(checkout, { recursive: true, force: true })
    }
  })

  it('isolates projects with identical directory names', () => {
    expect(projectName('/a/task', '/repo')).not.toBe(projectName('/b/task', '/repo'))
    expect(projectName('/repo', '/repo')).toBe('repo')
  })
  it('keeps the primary checkout on the default port', () => {
    expect(preferredPort('/repo', '/repo')).toBe(4321)
  })

  it('gives different worktrees independent port preferences', () => {
    expect(preferredPort('/repo/worktree-a', '/repo')).not.toBe(
      preferredPort('/repo/worktree-b', '/repo'),
    )
  })

  it('skips a port already bound by another application', async () => {
    const server = createServer()
    await new Promise<void>((resolve) => server.listen(0, '127.0.0.1', resolve))
    const address = server.address()
    if (!address || typeof address === 'string') throw new Error('Expected a TCP address')
    try {
      expect(await availablePort(address.port)).not.toBe(address.port)
    } finally {
      await new Promise<void>((resolve, reject) =>
        server.close((error) => (error ? reject(error) : resolve())),
      )
    }
  })
})

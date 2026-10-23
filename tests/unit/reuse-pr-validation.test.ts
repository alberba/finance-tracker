import { describe, expect, it, vi } from 'vitest'
import { findValidatedPullRequest } from '../../.github/scripts/reuse-pr-validation.mjs'

function scenario() {
  const pull = {
    merged_at: '2026-10-23T18:00:00Z',
    merge_commit_sha: 'merge',
    base: { ref: 'main' },
    head: { sha: 'pr-head' },
  }
  const run = {
    id: 42,
    conclusion: 'success',
    head_sha: 'pr-head',
    html_url: 'https://example.test/run/42',
  }
  const api = vi
    .fn()
    .mockResolvedValueOnce([pull])
    .mockResolvedValueOnce({ workflow_runs: [run] })
  const readTree = vi.fn().mockResolvedValue('validated-tree\n')
  const options = {
    repository: 'owner/repo',
    sha: 'merge',
    tree: 'validated-tree',
    branch: 'main',
    api,
    readTree,
  }
  return { pull, run, options, api, readTree }
}

describe('reuse of successful PR validation', () => {
  it('reuses a successful PR run only when the tested merge tree matches the push', async () => {
    const { options, api } = scenario()
    await expect(findValidatedPullRequest(options)).resolves.toBe('https://example.test/run/42')
    expect(api).toHaveBeenLastCalledWith(
      expect.stringContaining('event=pull_request&status=success&head_sha=pr-head'),
    )
  })

  it('requires fresh validation when merging changes the tree', async () => {
    const { options } = scenario()
    await expect(
      findValidatedPullRequest({ ...options, tree: 'different-tree' }),
    ).resolves.toBeUndefined()
  })

  it('requires fresh validation for direct pushes', async () => {
    const { options, api, readTree } = scenario()
    api.mockReset().mockResolvedValue([])
    await expect(findValidatedPullRequest(options)).resolves.toBeUndefined()
    expect(readTree).not.toHaveBeenCalled()
  })

  it.each(['open', 'different-merge', 'different-base'])(
    'rejects an unrelated PR: %s',
    async (kind) => {
      const { pull, options, readTree } = scenario()
      if (kind === 'open') Object.assign(pull, { merged_at: null })
      if (kind === 'different-merge') pull.merge_commit_sha = 'another-commit'
      if (kind === 'different-base') pull.base.ref = 'another-branch'
      await expect(findValidatedPullRequest(options)).resolves.toBeUndefined()
      expect(readTree).not.toHaveBeenCalled()
    },
  )

  it.each(['failure', 'pending', 'different-head'])(
    'rejects an unverified run: %s',
    async (kind) => {
      const { run, options, readTree } = scenario()
      if (kind === 'different-head') run.head_sha = 'old-head'
      else run.conclusion = kind
      await expect(findValidatedPullRequest(options)).resolves.toBeUndefined()
      expect(readTree).not.toHaveBeenCalled()
    },
  )

  it('requires fresh validation when the tree artifact has expired', async () => {
    const { options, readTree } = scenario()
    readTree.mockRejectedValue(new Error('Artifact expired'))
    await expect(findValidatedPullRequest(options)).resolves.toBeUndefined()
  })

  it('can use another successful run after an artifact expires', async () => {
    const { options, api, pull, run, readTree } = scenario()
    api
      .mockReset()
      .mockResolvedValueOnce([pull])
      .mockResolvedValueOnce({ workflow_runs: [run, { ...run, id: 43 }] })
    readTree
      .mockRejectedValueOnce(new Error('Artifact expired'))
      .mockResolvedValueOnce('validated-tree')
    await expect(findValidatedPullRequest(options)).resolves.toBe(run.html_url)
    expect(readTree).toHaveBeenLastCalledWith(43)
  })
})

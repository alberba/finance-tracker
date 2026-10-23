import { execFileSync } from 'node:child_process'
import { appendFileSync, mkdtempSync, readFileSync, rmSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { pathToFileURL } from 'node:url'

// Only reuse successful CI for the PR that produced this merge, and only when
// its checked-out merge tree exactly matches the pushed tree (including workflows).
export async function findValidatedPullRequest({ repository, sha, tree, branch, api, readTree }) {
  const pulls = await api(`repos/${repository}/commits/${sha}/pulls`)
  for (const pull of pulls) {
    if (!pull.merged_at || pull.merge_commit_sha !== sha || pull.base.ref !== branch) continue
    const { workflow_runs: runs } = await api(
      `repos/${repository}/actions/workflows/playwright.yml/runs?event=pull_request&status=success&head_sha=${pull.head.sha}&per_page=5`,
    )
    for (const run of runs) {
      if (run.conclusion !== 'success' || run.head_sha !== pull.head.sha) continue
      try {
        if ((await readTree(run.id)).trim() === tree) return run.html_url
      } catch {
        // Expired/missing artifacts cannot authorize reuse; try another run.
      }
    }
  }
  return undefined
}

function gh(args) {
  return execFileSync('gh', args, {
    encoding: 'utf8',
    timeout: 30_000,
    stdio: ['ignore', 'pipe', 'pipe'],
  })
}

async function main() {
  let validatedRun
  try {
    validatedRun = await findValidatedPullRequest({
      repository: process.env.GITHUB_REPOSITORY,
      sha: process.env.GITHUB_SHA,
      branch: process.env.GITHUB_REF_NAME,
      tree: execFileSync('git', ['rev-parse', 'HEAD^{tree}'], { encoding: 'utf8' }).trim(),
      api: (endpoint) => JSON.parse(gh(['api', endpoint])),
      readTree: (runId) => {
        const directory = mkdtempSync(join(tmpdir(), 'validated-pr-'))
        try {
          gh([
            'run',
            'download',
            String(runId),
            '--repo',
            process.env.GITHUB_REPOSITORY,
            '--name',
            'validated-tree',
            '--dir',
            directory,
          ])
          return readFileSync(join(directory, 'validated-tree.txt'), 'utf8')
        } finally {
          rmSync(directory, { recursive: true, force: true })
        }
      },
    })
  } catch {
    console.warn('Unable to verify PR validation; running quality checks on this push.')
  }
  appendFileSync(process.env.GITHUB_OUTPUT, `reused=${Boolean(validatedRun)}\n`)
  appendFileSync(
    process.env.GITHUB_STEP_SUMMARY,
    validatedRun
      ? `Reusing [successful PR CI](${validatedRun}): the pushed Git tree is identical.\n`
      : 'No successful PR CI with an identical Git tree was verified. Running quality checks.\n',
  )
}

if (process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href) await main()

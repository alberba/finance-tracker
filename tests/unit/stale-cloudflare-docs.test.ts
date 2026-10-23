import { readFileSync } from 'node:fs'
import { describe, expect, it } from 'vitest'

/**
 * Production is Docker + SQLite (docs/operations/self-hosting.md); Cloudflare
 * Workers/D1 only survive for dev, `pnpm preview` and tests. Setup guides that
 * still tell an agent to `wrangler secret put` send it to a deploy target that
 * no longer exists, so the command may appear only under a "(anterior)" heading.
 */

const guides = ['README.md', 'docs/operations/authentication.md', 'docs/operations/self-hosting.md']

function outsideLegacySections(text: string): string[] {
  const kept: string[] = []
  let legacy = false

  for (const line of text.split('\n')) {
    if (/^#{1,6}\s/.test(line)) legacy = /\(anterior\)/i.test(line)
    if (!legacy) kept.push(line)
  }

  return kept
}

describe('setup guides', () => {
  it.each(guides)('%s has no `wrangler secret put` outside a "(anterior)" section', (path) => {
    const text = readFileSync(new URL(`../../${path}`, import.meta.url), 'utf8')
    const hits = outsideLegacySections(text).filter((line) => /wrangler secret put/.test(line))

    expect(hits).toEqual([])
  })
})

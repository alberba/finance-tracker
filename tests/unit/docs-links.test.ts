import { existsSync, readdirSync, readFileSync } from 'node:fs'
import { dirname, join, relative } from 'node:path'
import { describe, expect, it } from 'vitest'

/**
 * Agents follow doc links and `docs/...` paths literally, so a dead one costs
 * calls or silently sends them to a guide that was never written. Guards the
 * root markdown files and everything under docs/.
 */

const root = new URL('../../', import.meta.url).pathname
const rootDocs = ['AGENTS.md', 'CODING_STANDARDS.md', 'CONTRIBUTING.md', 'GLOSSARY.md', 'README.md']

const docPaths = [
  ...rootDocs,
  ...(readdirSync(join(root, 'docs'), { recursive: true }) as string[])
    .filter((path) => path.endsWith('.md'))
    .map((path) => join('docs', path)),
].filter((path) => existsSync(join(root, path)))

function deadReferences(docPath: string): string[] {
  const text = readFileSync(join(root, docPath), 'utf8')
  const dead: string[] = []

  // Markdown links resolve relative to the file that holds them.
  for (const [, target] of text.matchAll(/\]\(([^)\s#]+)(?:#[^)]*)?\)/g)) {
    if (/^[a-z]+:/i.test(target)) continue
    if (!existsSync(join(root, dirname(docPath), target))) dead.push(target)
  }

  // Backticked repo-relative paths to markdown files, as in "`docs/x.md`".
  for (const [, target] of text.matchAll(/`((?:docs\/)[\w./-]+\.md)`/g)) {
    if (!existsSync(join(root, target))) dead.push(target)
  }

  return dead
}

describe('ADR numbers', () => {
  it('are unique, so "ADR NNNN" names one decision', () => {
    const numbers = readdirSync(join(root, 'docs/adr'))
      .filter((name) => /^\d{4}-.+\.md$/.test(name))
      .map((name) => name.slice(0, 4))
    const repeated = numbers.filter((number, index) => numbers.indexOf(number) !== index)
    expect(repeated).toEqual([])
  })
})

describe('documentation references', () => {
  it.each(docPaths)('%s has no dead links', (docPath) => {
    expect(deadReferences(docPath), relative(root, join(root, docPath))).toEqual([])
  })
})

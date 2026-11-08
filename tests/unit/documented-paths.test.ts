import { existsSync, readdirSync, readFileSync, statSync } from 'node:fs'
import { join } from 'node:path'
import { describe, expect, it } from 'vitest'

// Docs and config that name a repo path keep naming one that exists. docs/archive,
// docs/design and docs/research are dated records and keep the paths of their day.
const HISTORICAL = new Set(['archive', 'design', 'research'])
const ROOT_FILES = [
  'AGENTS.md',
  'CODING_STANDARDS.md',
  'CONTRIBUTING.md',
  'README.md',
  'GLOSSARY.md',
  'DESIGN.md',
  'pnpm-workspace.yaml',
  'eslint.config.ts',
  'playwright.config.ts',
  'playwright.shared.ts',
  'playwright.browser.ts',
]
const PATH = /(?<![\w./-])((?:scripts|tests|docs|src|public|migrations-v2|\.github)\/[\w@./-]*\w)/g

function filesUnder(directory: string, pattern: RegExp): string[] {
  return readdirSync(directory).flatMap((name) => {
    const path = join(directory, name)
    if (statSync(path).isDirectory()) return HISTORICAL.has(name) ? [] : filesUnder(path, pattern)
    return pattern.test(path) ? [path] : []
  })
}

describe('rutas citadas en docs y configuración', () => {
  it('apuntan a ficheros que existen', () => {
    const files = [
      ...ROOT_FILES,
      ...filesUnder('docs', /\.md$/),
      ...filesUnder('.github', /\.(ya?ml|md)$/),
    ]
    const missing = files.flatMap((file) =>
      [...readFileSync(file, 'utf8').matchAll(PATH)]
        .map((match) => match[1]!)
        .filter((path) => !existsSync(path))
        .map((path) => `${file}: ${path}`),
    )

    expect(missing).toEqual([])
  })
})

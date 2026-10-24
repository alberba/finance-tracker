/**
 * Phase 6 of ADR-0006: a Vue component only talks to stores, composables and
 * the client runtime. Storage and transport live behind services, and a
 * handler that runs an effect does it through `runClientHttp` at the event
 * entry point — never by reaching for `fetch` or IndexedDB in the template
 * script.
 */

import { readdirSync, readFileSync, statSync } from 'node:fs'
import { join, relative } from 'node:path'

import { describe, expect, it } from 'vitest'

const COMPONENTS_DIR = join(process.cwd(), 'src/components')

function componentFiles(dir: string): string[] {
  return readdirSync(dir).flatMap((entry) => {
    const path = join(dir, entry)
    if (statSync(path).isDirectory()) return componentFiles(path)
    return path.endsWith('.vue') ? [path] : []
  })
}

const files = componentFiles(COMPONENTS_DIR)

const FORBIDDEN_IN_COMPONENTS = [
  /\bfetch\s*\(/,
  /\bindexedDB\b/,
  /\blocalStorage\b/,
  /\bsessionStorage\b/,
]

const FORBIDDEN_CLIENT_MODULES = [
  'api-client',
  'bitvavo-api',
  'crypto',
  'data-backup',
  'http',
  'idb-cache',
  'outbox',
  'state-initialize',
  'storage',
  'wipe',
]

describe('component boundaries (ADR-0006, fase 6)', () => {
  it('covers the component tree', () => {
    expect(files.length).toBeGreaterThan(50)
  })

  it('does not talk to fetch or browser storage from a component', () => {
    const offenders = files.flatMap((file) => {
      const source = readFileSync(file, 'utf8')
      return FORBIDDEN_IN_COMPONENTS.filter((pattern) => pattern.test(source)).map(
        (pattern) => `${relative(process.cwd(), file)}: ${pattern}`,
      )
    })

    expect(offenders).toEqual([])
  })

  it('imports only the client runtime, stores, composables and services', () => {
    const offenders = files.flatMap((file) => {
      const source = readFileSync(file, 'utf8')
      return FORBIDDEN_CLIENT_MODULES.filter((module) =>
        new RegExp(`from ['"][^'"]*lib/client/${module}['"]`).test(source),
      ).map((module) => `${relative(process.cwd(), file)}: ${module}`)
    })

    expect(offenders).toEqual([])
  })
})

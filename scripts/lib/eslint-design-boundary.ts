import { dirname, relative, resolve, sep } from 'node:path'

import type { Rule } from 'eslint'

/**
 * Keeps shared code free of the design (src/neon).
 *
 * Three kinds of code under `src/`:
 *
 * - **design**: `src/neon/`, components, sections, view-models, presentation
 *   stores and styles.
 * - **entry**: `src/pages/`, the routes and API handlers that wire the app
 *   together; they may import anything.
 * - **shared**: everything else (domain, sync, stores, config, types, libs).
 *
 * The design imports shared code, never the other way round: shared code that
 * needs something from the design is a sign that it belongs in shared code.
 */

/** Repo-relative POSIX prefixes. A trailing `/` means "everything under it". */
const DESIGN = ['src/neon/']
const ENTRY_POINTS = ['src/pages/']

type Zone = 'design' | 'shared' | 'entry' | 'outside'

function toRepoPath(absolutePath: string, cwd: string): string {
  return relative(cwd, absolutePath).split(sep).join('/')
}

function startsWithAny(path: string, prefixes: string[]): boolean {
  return prefixes.some((prefix) => path.startsWith(prefix) || `${path}/` === prefix)
}

function zoneOf(path: string): Zone {
  if (!path.startsWith('src/')) return 'outside'
  if (startsWithAny(path, DESIGN)) return 'design'
  if (startsWithAny(path, ENTRY_POINTS)) return 'entry'
  return 'shared'
}

/** The SFC and Astro processors lint each script as `<file>.vue/<n>.ts`. */
function realFile(filename: string): string {
  return filename.replace(/(\.(?:astro|vue))[\\/][^\\/]+$/, '$1')
}

const MESSAGE =
  'El código compartido no importa del diseño (src/neon): al revés, el diseño lo usa a él.'

export const noSharedToDesignImports: Rule.RuleModule = {
  meta: {
    type: 'problem',
    schema: [],
    docs: { description: 'Forbid shared code importing from the design tree (src/neon)' },
  },
  create(context) {
    const file = toRepoPath(realFile(context.filename), context.cwd)
    if (zoneOf(file) !== 'shared') return {}

    function check(source: { value?: unknown } | null | undefined, node: Rule.Node) {
      const specifier = source?.value
      if (typeof specifier !== 'string' || !specifier.startsWith('.')) return
      const target = toRepoPath(
        resolve(dirname(realFile(context.filename)), specifier),
        context.cwd,
      )
      if (zoneOf(target) === 'design') {
        context.report({ node, message: `${MESSAGE} (${file} → ${specifier})` })
      }
    }

    return {
      ImportDeclaration: (node) => check(node.source, node),
      ExportAllDeclaration: (node) => check(node.source, node),
      ExportNamedDeclaration: (node) => check(node.source, node),
      ImportExpression: (node) => check(node.source as { value?: unknown }, node),
    }
  },
}

export const designBoundary = {
  rules: { 'no-shared-to-design-imports': noSharedToDesignImports },
}

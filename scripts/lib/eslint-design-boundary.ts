import { dirname, relative, resolve, sep } from 'node:path'

import type { Rule } from 'eslint'

/**
 * Keeps the two designs apart during the «neón de garaje» migration
 * (ADR 0010, docs/adr/0010-migracion-con-convivencia-aislada.md).
 *
 * Three kinds of code under `src/`:
 *
 * - **new**: `src/neon/`, the whole new design.
 * - **old**: the frozen design, in place (`src/components/`, `src/styles/`).
 * - **shared**: everything else (domain, sync, stores, config, types, libs).
 *
 * The new and the old tree never import each other, and shared code imports
 * neither. Only the named seams below may cross; they are the whole list, and
 * the last ticket of the migration deletes or simplifies them.
 */

/** Repo-relative POSIX prefixes. A trailing `/` means "everything under it". */
const NEW_DESIGN = ['src/neon/']
const OLD_DESIGN = ['src/components/', 'src/styles/']

/**
 * Entry points that wire the app together (routes, API handlers). They sit
 * above both designs and may import any of them.
 */
const ENTRY_POINTS = ['src/pages/']

/**
 * The named seams: files allowed to cross the boundary, importing from and
 * being imported by either design. Add a seam only when a ticket creates it,
 * and name it in ADR 0010.
 */
export const SEAMS: Record<string, string[]> = {
  /** The shell that picks the frame (desktop sidebar or mobile bars). */
  shell: ['src/components/FinanceTrackerShell.astro'],
  /** The selector that mounts the new or the old version of each section. */
  'section-selector': ['src/components/FinanceWorkspace.vue'],
  /** Which design each section uses (the list of migrated sections). */
  'section-design': ['src/config/section-design.ts'],
  /** The «Diseño nuevo / antiguo» toggle, mounted from both frames. */
  toggle: ['src/components/layout/DesignToggle.vue', 'src/neon/layout/DesignToggle.vue'],
}

type Zone = 'new' | 'old' | 'shared' | 'entry' | 'seam' | 'outside'

const SEAM_FILES = new Set(Object.values(SEAMS).flat())

function toRepoPath(absolutePath: string, cwd: string): string {
  return relative(cwd, absolutePath).split(sep).join('/')
}

function startsWithAny(path: string, prefixes: string[]): boolean {
  return prefixes.some((prefix) => path.startsWith(prefix) || `${path}/` === prefix)
}

function zoneOf(path: string): Zone {
  if (SEAM_FILES.has(path)) return 'seam'
  if (!path.startsWith('src/')) return 'outside'
  if (startsWithAny(path, NEW_DESIGN)) return 'new'
  if (startsWithAny(path, OLD_DESIGN)) return 'old'
  if (startsWithAny(path, ENTRY_POINTS)) return 'entry'
  return 'shared'
}

/** The SFC and Astro processors lint each script as `<file>.vue/<n>.ts`. */
function realFile(filename: string): string {
  return filename.replace(/(\.(?:astro|vue))[\\/][^\\/]+$/, '$1')
}

const FORBIDDEN: Partial<Record<Zone, Partial<Record<Zone, string>>>> = {
  new: {
    old: 'El diseño nuevo (src/neon) no importa del antiguo: copia lo que necesites o llévalo a código compartido.',
  },
  old: {
    new: 'El diseño antiguo está congelado y no importa del nuevo (src/neon). Solo los puntos de unión con nombre cruzan.',
  },
  shared: {
    new: 'El código compartido no importa del diseño nuevo (src/neon): al revés, el diseño lo usa a él.',
    old: 'El código compartido no importa del diseño antiguo (src/components, src/styles): mueve lo compartido a src/lib o src/domain.',
  },
}

export const noCrossDesignImports: Rule.RuleModule = {
  meta: {
    type: 'problem',
    schema: [],
    docs: {
      description:
        'Forbid imports across the new design, the old design and shared code (ADR 0010)',
    },
  },
  create(context) {
    const file = toRepoPath(realFile(context.filename), context.cwd)
    const from = zoneOf(file)
    const forbiddenTargets = FORBIDDEN[from]
    if (!forbiddenTargets) return {}

    function check(source: { value?: unknown; loc?: unknown } | null | undefined, node: Rule.Node) {
      const specifier = source?.value
      if (typeof specifier !== 'string' || !specifier.startsWith('.')) return
      const target = toRepoPath(
        resolve(dirname(realFile(context.filename)), specifier),
        context.cwd,
      )
      const message = forbiddenTargets![zoneOf(target)]
      if (message) {
        context.report({ node, message: `${message} (${file} → ${specifier})` })
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
  rules: { 'no-cross-design-imports': noCrossDesignImports },
}

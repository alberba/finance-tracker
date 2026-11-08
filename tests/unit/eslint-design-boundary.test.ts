import { join } from 'node:path'

import { Linter } from 'eslint'
import tseslint from 'typescript-eslint'
import { describe, expect, it } from 'vitest'

import { designBoundary } from '../../scripts/lib/eslint-design-boundary'

const cwd = process.cwd()

/** Lints `code` as if it lived at `file` (repo-relative) and returns the boundary messages. */
function boundaryMessages(file: string, code: string): string[] {
  const linter = new Linter({ cwd, configType: 'flat' })
  return linter
    .verify(
      code,
      [
        {
          files: ['**/*.ts', '**/*.vue', '**/*.astro'],
          languageOptions: { parser: tseslint.parser },
          plugins: { 'design-boundary': designBoundary },
          rules: { 'design-boundary/no-cross-design-imports': 'error' },
        },
      ],
      { filename: join(cwd, file) },
    )
    .map((message) => message.message)
}

const LEGACY_FROM_NEON = "import Panel from '../../components/ui/SidePanel.vue'"
const NEON_FROM_LEGACY = "import Panel from '../../neon/ui/Sheet.vue'"

describe('design boundary lint', () => {
  it('rejects the new tree importing the old one', () => {
    expect(boundaryMessages('src/neon/sections/Home.ts', LEGACY_FROM_NEON)).toEqual([
      expect.stringContaining('src/neon'),
    ])
  })

  it('rejects the old tree importing the new one', () => {
    expect(boundaryMessages('src/components/ui/Thing.ts', NEON_FROM_LEGACY)).toEqual([
      expect.stringContaining('src/neon'),
    ])
  })

  it('rejects shared code importing either design', () => {
    expect(boundaryMessages('src/domain/x.ts', "import '../components/ui/tone'")).toHaveLength(1)
    expect(boundaryMessages('src/lib/x.ts', "import '../neon/ui/Sheet.vue'")).toHaveLength(1)
  })

  it('allows both designs to import shared code and their own tree', () => {
    for (const file of ['src/neon/a/B.ts', 'src/components/a/B.ts']) {
      expect(boundaryMessages(file, "import '../../domain/x'; import '../../lib/y'")).toEqual([])
    }
    expect(boundaryMessages('src/neon/a/B.ts', "import './C'; import '../d/E'")).toEqual([])
    expect(boundaryMessages('src/components/a/B.ts', "import './C'; import '../d/E'")).toEqual([])
  })

  it('catches type imports, re-exports and dynamic imports', () => {
    expect(
      boundaryMessages('src/neon/a/B.ts', "import type { Tone } from '../../components/ui/tone'"),
    ).toHaveLength(1)
    expect(
      boundaryMessages('src/neon/a/B.ts', "export * from '../../components/ui/tone'"),
    ).toHaveLength(1)
    expect(
      boundaryMessages('src/neon/a/B.ts', "export { x } from '../../components/ui/tone'"),
    ).toHaveLength(1)
    expect(
      boundaryMessages('src/neon/a/B.ts', "const m = () => import('../../components/ui/tone')"),
    ).toHaveLength(1)
  })

  it('resolves the path, not the spelling', () => {
    // `../neon/..` from src/components/x looks "new" but a path that climbs and
    // comes back into the same tree is still inside it.
    expect(boundaryMessages('src/neon/a/B.ts', "import '../../neon/c/D'")).toEqual([])
    expect(boundaryMessages('src/neon/a/B.ts', "import '../../neon/../components/D'")).toHaveLength(
      1,
    )
  })

  it('ignores packages and files outside src', () => {
    expect(boundaryMessages('src/neon/a/B.ts', "import { ref } from 'vue'")).toEqual([])
    expect(boundaryMessages('src/neon/a/B.ts', "import '../../../public/sw.js'")).toEqual([])
    expect(boundaryMessages('tests/unit/x.ts', "import '../../src/components/ui/tone'")).toEqual([])
  })

  it('lets the named seams cross, from either side', () => {
    // The shell picks the frame: it may import both designs.
    expect(
      boundaryMessages(
        'src/components/FinanceTrackerShell.astro',
        "import '../neon/ui/Sheet.vue'; import '../components/ui/tone'",
      ),
    ).toEqual([])
    // And a neon file may mount a seam that lives in the old tree.
    expect(
      boundaryMessages(
        'src/neon/layout/More.ts',
        "import '../../components/layout/DesignToggle.vue'",
      ),
    ).toEqual([])
  })

  it('sees through the virtual files of .astro and .vue scripts', () => {
    expect(
      boundaryMessages('src/neon/a/B.vue/0_script.ts', "import '../../components/ui/tone'"),
    ).toHaveLength(1)
  })
})

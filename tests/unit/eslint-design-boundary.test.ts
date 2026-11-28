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
          rules: { 'design-boundary/no-shared-to-design-imports': 'error' },
        },
      ],
      { filename: join(cwd, file) },
    )
    .map((message) => message.message)
}

describe('design boundary lint', () => {
  it('rejects shared code importing the design', () => {
    expect(boundaryMessages('src/lib/x.ts', "import '../neon/ui/Sheet.vue'")).toEqual([
      expect.stringContaining('src/neon'),
    ])
    expect(boundaryMessages('src/domain/a/x.ts', "import '../../neon/ui/tone'")).toHaveLength(1)
  })

  it('lets the design import shared code and itself', () => {
    expect(
      boundaryMessages('src/neon/a/B.ts', "import '../../domain/x'; import '../../lib/y'"),
    ).toEqual([])
    expect(boundaryMessages('src/neon/a/B.ts', "import './C'; import '../d/E'")).toEqual([])
  })

  it('lets the routes import anything', () => {
    expect(boundaryMessages('src/pages/index.astro', "import '../neon/app/AppShell.astro'")).toEqual(
      [],
    )
  })

  it('catches type imports, re-exports and dynamic imports', () => {
    expect(
      boundaryMessages('src/lib/x.ts', "import type { Tone } from '../neon/ui/tone'"),
    ).toHaveLength(1)
    expect(boundaryMessages('src/lib/x.ts', "export * from '../neon/ui/tone'")).toHaveLength(1)
    expect(boundaryMessages('src/lib/x.ts', "export { x } from '../neon/ui/tone'")).toHaveLength(1)
    expect(boundaryMessages('src/lib/x.ts', "const m = () => import('../neon/ui/tone')")).toHaveLength(
      1,
    )
  })

  it('resolves the path, not the spelling', () => {
    expect(boundaryMessages('src/lib/a/x.ts', "import '../../neon/../lib/y'")).toEqual([])
    expect(boundaryMessages('src/lib/a/x.ts', "import '../../lib/../neon/y'")).toHaveLength(1)
  })

  it('ignores packages and files outside src', () => {
    expect(boundaryMessages('src/lib/x.ts', "import { ref } from 'vue'")).toEqual([])
    expect(boundaryMessages('tests/unit/x.ts', "import '../../src/neon/ui/tone'")).toEqual([])
  })

  it('sees through the virtual files of .astro and .vue scripts', () => {
    expect(
      boundaryMessages('src/composables/A.vue/0_script.ts', "import '../neon/ui/tone'"),
    ).toHaveLength(1)
  })
})

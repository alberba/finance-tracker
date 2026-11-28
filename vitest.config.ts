import { coverageConfigDefaults, defineConfig } from 'vitest/config'

export default defineConfig({
  test: {
    projects: [
      './vitest.unit.config.ts',
      './vitest.component.config.ts',
      './vitest.integration.config.ts',
    ],
    coverage: {
      provider: 'v8',
      enabled: false,
      include: [
        'src/neon/**/*.vue',
        'src/neon/**/*.ts',
        'src/composables/**/*.ts',
        'src/domain/**/*.ts',
        'src/lib/**/*.ts',
        'src/services/**/*.ts',
        'src/stores/**/*.ts',
      ],
      exclude: [
        ...coverageConfigDefaults.exclude,
        'src/lib/client/types.ts',
        'src/lib/server/types.ts',
      ],
      reporter: process.env.CI ? ['text', 'json-summary'] : ['text', 'html', 'json-summary'],
      // Measured on the merge of the redesign into main (#454), with the neon
      // UI in place of src/components (pnpm test:coverage): lines 59.91,
      // statements 58.06, functions 52.73, branches 48.83. The neon screens are
      // mostly covered by E2E, so this is a new baseline, not a drop of the old
      // one. Keep the minimum just below the measurement; raise it with new code.
      thresholds: {
        lines: 59.4,
        statements: 57.5,
        functions: 52.2,
        branches: 48.3,
      },
    },
  },
})

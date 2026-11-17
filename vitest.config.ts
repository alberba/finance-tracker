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
      // Coverage follows the code that carries rules, not presentation: the
      // old component tree is frozen and the new UI is covered by E2E. Keep
      // the new design's view models, persistence and API surface in scope so
      // a regression in the logic is visible even if a template changes.
      include: [
        'src/composables/**/*.ts',
        'src/domain/**/*.ts',
        'src/lib/**/*.ts',
        'src/neon/**/*.ts',
        'src/db/**/*.ts',
        'src/pages/api/**/*.ts',
        'src/services/**/*.ts',
        'src/stores/**/*.ts',
        'src/middleware.ts',
      ],
      exclude: [
        ...coverageConfigDefaults.exclude,
        'src/lib/client/types.ts',
        'src/lib/server/types.ts',
      ],
      reporter: process.env.CI ? ['text', 'json-summary'] : ['text', 'html', 'json-summary'],
      // Measured on the tree after the «neón de garaje» migration
      // (2026-11-17): lines 80.48, branches 72.38, functions 78.72,
      // statements 82.32. Keep the gate just below the measurement so new
      // code cannot silently lower it; raise it with the next meaningful
      // batch of tests instead of adding coverage-only cases.
      thresholds: {
        lines: 82,
        statements: 80,
        functions: 78,
        branches: 72,
      },
    },
  },
})

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
        'src/components/**/*.vue',
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
      // Measured after the #487 review fixes (pnpm test:coverage):
      // lines 73.85, statements 71.37, functions 63.64, branches 63.10.
      // Keep the minimum just below the measurement; raise it with new code.
      thresholds: {
        lines: 73.3,
        statements: 70.8,
        functions: 63.1,
        branches: 62.6,
      },
    },
  },
})

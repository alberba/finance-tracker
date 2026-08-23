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
      all: true,
      thresholds: {
        lines: 29,
        statements: 29,
        functions: 75,
        branches: 70,
      },
    },
  },
})

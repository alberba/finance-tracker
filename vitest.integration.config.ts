import { defineConfig } from 'vitest/config'

// Integration projects use real SQLite engines and apply migrations-v2/*.sql.
export default defineConfig({
  resolve: {
    alias: {
      'cloudflare:workers': new URL('./tests/stubs/cloudflare-workers.ts', import.meta.url)
        .pathname,
    },
  },
  test: {
    name: 'integration',
    include: ['tests/integration/**/*.test.ts'],
    exclude: ['tests/integration/d1-v2/repair/execute.test.ts'],
    environment: 'node',
    globals: true,
    clearMocks: true,
    restoreMocks: true,
    // Real SQLite handles are not free — avoid oversubscribing workers.
    pool: 'forks',
  },
})

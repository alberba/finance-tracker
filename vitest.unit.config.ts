import { defineProject } from 'vitest/config'

export default defineProject({
  resolve: {
    alias: {
      'cloudflare:workers': new URL('./tests/stubs/cloudflare-workers.ts', import.meta.url).pathname,
    },
  },
  test: {
    name: 'unit',
    include: ['tests/unit/**/*.test.ts'],
    environment: 'node',
    globals: true,
    clearMocks: true,
    restoreMocks: true,
  },
})

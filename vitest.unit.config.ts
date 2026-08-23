import { defineProject } from 'vitest/config'

export default defineProject({
  test: {
    name: 'unit',
    include: ['tests/unit/**/*.test.ts'],
    environment: 'node',
    globals: true,
    clearMocks: true,
    restoreMocks: true,
  },
})

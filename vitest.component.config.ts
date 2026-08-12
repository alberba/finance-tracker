import vue from '@vitejs/plugin-vue'
import { defineProject } from 'vitest/config'

export default defineProject({
  plugins: [vue()],
  test: {
    name: 'component',
    include: ['tests/component/**/*.test.ts'],
    environment: 'happy-dom',
    globals: true,
    clearMocks: true,
    restoreMocks: true,
  },
})

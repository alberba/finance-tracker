import { defineConfig } from 'vitest/config'
import integration from './vitest.integration.config'

export default defineConfig({
  ...integration,
  test: {
    ...integration.test,
    name: 'integration-cli',
    include: ['tests/integration/d1-v2/repair/execute.test.ts'],
    exclude: [],
    // CLI subprocess startup must not compete with every project's transforms.
    sequence: { groupOrder: 1 },
  },
})

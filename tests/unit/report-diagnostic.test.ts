import { expect, it } from 'vitest'

import { diagnosticSchema } from '../../src/lib/server/report-diagnostic-schema'

it('keeps private captures limited to typed codes and strips financial and identity fields', () => {
  const capture = {
    screen: 'transactions',
    capturedAt: '2026-08-23T00:00:00.000Z',
    version: '2.0.0',
    device: 'desktop',
    load: 'ready',
    sync: { revision: 3, pending: 1, accountId: 'private-account' },
    section: {
      checks: ['filters-active'],
      options: ['search'],
      search: 'private search',
      amount: 200,
      movements: [{ amount: 100 }],
    },
    steps: ['import-complete', 'transactions', 'sync-pending'],
    credentials: 'private credentials',
  }
  const result = diagnosticSchema.parse(capture)

  expect(result).toEqual({
    screen: 'transactions',
    capturedAt: capture.capturedAt,
    version: '2.0.0',
    device: 'desktop',
    load: 'ready',
    sync: { revision: 3, pending: 1 },
    section: { checks: ['filters-active'], options: ['search'] },
    steps: capture.steps,
  })
  expect(
    diagnosticSchema.safeParse({
      ...capture,
      steps: ['private search'],
    }).success,
  ).toBe(false)
})

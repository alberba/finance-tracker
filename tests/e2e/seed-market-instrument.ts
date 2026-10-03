import { execFileSync } from 'node:child_process'
import { randomUUID } from 'node:crypto'
import { expect, type APIRequestContext } from '@playwright/test'

/** The global catalog has no write API; seed only local D1, then use the real user sync API. */
export async function seedMarketInstrument(request: APIRequestContext) {
  const id = randomUUID()
  const now = new Date().toISOString()
  execFileSync(
    'pnpm',
    [
      'exec',
      'wrangler',
      'd1',
      'execute',
      'finance-tracker-db-v2',
      '--local',
      '--persist-to',
      '.wrangler/state',
      '--command',
      `INSERT INTO market_instruments (id, symbol, normalized_symbol, provider, name, currency, created_at, updated_at) VALUES ('${id}', 'BTC', 'BTC', 'e2e-${id}', 'Bitcoin E2E', 'EUR', '${now}', '${now}')`,
    ],
    { stdio: 'pipe' },
  )
  const response = await request.post('/api/sync', {
    data: {
      commands: [
        {
          commandId: randomUUID(),
          action: 'create',
          entityType: 'userInstrument',
          data: { id: randomUUID(), instrumentId: id },
        },
      ],
    },
  })
  expect(response.ok()).toBe(true)
  expect((await response.json()).results[0].status).toBe('applied')
  return id
}

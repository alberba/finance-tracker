import { execFileSync } from 'node:child_process'
import { randomUUID } from 'node:crypto'
import { expect, type APIRequestContext } from '@playwright/test'
import { syncV2TestHeaders } from './seed-sync-v2'

/** The global catalog has no write API; seed only local D1, then use the real user sync API. */
export async function seedMarketInstrument(request: APIRequestContext, email: string) {
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
  const headers = await syncV2TestHeaders(request, email)
  const response = await request.post('/api/sync', {
    headers,
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

import 'fake-indexeddb/auto'
import { setActivePinia } from 'pinia'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'

import { createTestPinia } from '../../helpers/pinia'
import { useMarketStore } from '../../../src/stores/market'
import { useSyncStore } from '../../../src/stores/sync'

type Command = {
  commandId: string
  action: string
  entityType?: string
  entityId?: string
  data?: Record<string, unknown>
  patch?: Record<string, unknown>
}

const BOOTSTRAP = {
  revision: 0,
  settings: null,
  accounts: [{ id: 'asset', name: 'Cartera', kind: 'investment', version: 1 }],
  categories: [],
  transactions: [],
  subscriptions: [],
  recurringRules: [],
  pendingMovements: [],
  budgetEntries: [],
  goals: [],
  contributions: [],
  userInstruments: [],
  wealthSnapshots: [],
}

function json(body: unknown, status = 200): Response {
  return new Response(JSON.stringify(body), {
    status,
    headers: { 'Content-Type': 'application/json' },
  })
}

let userCounter = 0
let received: Command[]
let syncResponse: (commands: Command[]) => Response

beforeEach(() => {
  userCounter += 1
  received = []
  vi.stubGlobal('navigator', { onLine: true })
  syncResponse = (commands) =>
    json({
      results: commands.map((command) => ({
        commandId: command.commandId,
        status: 'applied',
        entity: { ...command.data, version: 1 },
      })),
      revision: 1,
      halted: false,
    })
  vi.stubGlobal(
    'fetch',
    vi.fn(async (url: string, init?: RequestInit) => {
      if (url === '/api/bootstrap') return json(BOOTSTRAP)
      if (url.startsWith('/api/changes')) return json({ revision: 1, changes: [] })
      if (url === '/api/sync') {
        const { commands } = JSON.parse(String(init?.body)) as { commands: Command[] }
        received.push(...commands)
        return syncResponse(commands)
      }
      throw new Error(`unexpected fetch ${url}`)
    }),
  )
  setActivePinia(createTestPinia())
})

afterEach(async () => {
  await useSyncStore().logout({ discardPending: true })
  vi.unstubAllGlobals()
})

/** La configuración que el servidor acaba guardando: el alta con los parches posteriores. */
function persistedConfig(): Record<string, unknown> {
  let config: Record<string, unknown> = {}
  for (const command of received) {
    const source = command.action === 'create' ? command.data : command.patch
    config = { ...config, ...((source?.quoteConfig as Record<string, unknown>) ?? {}) }
  }
  return config
}

async function addInstrument() {
  const sync = useSyncStore()
  await sync.init(`quote-owner-${userCounter}`)
  const market = useMarketStore()
  market.addInstrument({
    investmentAssetId: 'asset',
    type: 'etf',
    symbol: 'XDWH.XETRA',
    market: '',
    currency: 'EUR',
    provider: 'yahoo',
  })
  return market
}

describe('configuración del ticker de cotización', () => {
  it('guarda el ticker elegido cuando se cambia antes de que el alta llegue al servidor', async () => {
    syncResponse = () => json({ error: 'caído' }, 500)
    const market = await addInstrument()
    market.configureInstrumentSymbols(market.instruments[0].id, 'XDWH.XETRA', 'XDWH.DE')

    await vi.waitFor(() => expect(received.length).toBeGreaterThan(0))
    expect(persistedConfig()).toMatchObject({ symbol: 'XDWH.XETRA', quoteSymbol: 'XDWH.DE' })
  })

  it('guarda el ticker elegido en una actualización cuando el alta ya está en la caché', async () => {
    const market = await addInstrument()
    await vi.waitFor(() => expect(received).toHaveLength(1))

    market.configureInstrumentSymbols(market.instruments[0].id, 'XDWH.XETRA', 'XDWH.DE')

    await vi.waitFor(() => {
      expect(received.at(-1)).toMatchObject({ action: 'update', entityType: 'userInstrument' })
    })
    expect(persistedConfig()).toMatchObject({ symbol: 'XDWH.XETRA', quoteSymbol: 'XDWH.DE' })
  })
})

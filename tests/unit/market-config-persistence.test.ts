import { createPinia, setActivePinia } from 'pinia'
import { beforeEach, expect, it, vi } from 'vitest'

const { create, update, resolve, session } = vi.hoisted(() => ({
  create: vi.fn(),
  update: vi.fn(),
  resolve: vi.fn(),
  session: { userId: 'quote-owner', getUserInstrumentId: vi.fn(async () => null) },
}))
vi.mock('../../src/lib/client/command-mapping', () => ({
  syncCreate: create,
  syncUpdate: update,
  resolveEntityId: resolve,
  syncRemove: vi.fn(),
}))
vi.mock('../../src/lib/client/demo-source', () => ({ isReadOnlyDemoActive: () => false }))
vi.mock('../../src/stores/sync', () => ({ useSyncStore: () => session }))
import { useMarketStore } from '../../src/stores/market'

beforeEach(() => {
  setActivePinia(createPinia())
  vi.clearAllMocks()
})

it('guarda el ticker elegido aunque el alta ya esté confirmada y aún no aparezca en la caché', async () => {
  let persisted: Record<string, unknown> | null = null
  resolve.mockImplementation(async (type: string) => (type === 'account' ? 'owned-asset' : null))
  create.mockImplementation(async (_type, _id, data) => {
    persisted ??= data
    return true
  })
  update.mockImplementation(async (_type, _id, patch) => {
    persisted = { ...persisted, ...patch }
    return true
  })
  const market = useMarketStore()
  market.addInstrument({
    investmentAssetId: 'asset',
    type: 'etf',
    symbol: 'XDWH.XETRA',
    market: '',
    currency: 'EUR',
    provider: 'yahoo',
  })
  market.configureInstrumentSymbols(market.instruments[0].id, 'XDWH.XETRA', 'XDWH.DE')
  await vi.waitFor(() => {
    expect(persisted).toMatchObject({
      quoteConfig: { symbol: 'XDWH.XETRA', quoteSymbol: 'XDWH.DE' },
    })
  })
})

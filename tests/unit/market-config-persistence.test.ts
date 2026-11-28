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

it('guarda el ticker elegido al dar de alta el símbolo', async () => {
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
    quoteSymbol: 'XDWH.DE',
    market: '',
    currency: 'EUR',
    provider: 'yahoo',
  })
  await vi.waitFor(() => {
    expect(persisted).toMatchObject({
      quoteConfig: { symbol: 'XDWH.XETRA', quoteSymbol: 'XDWH.DE' },
    })
  })
})

it('al cambiar el ticker de un activo enlazado lo guarda y conserva el símbolo de sus movimientos', async () => {
  const persisted: Record<string, unknown>[] = []
  resolve.mockImplementation(async (type: string) => (type === 'account' ? 'owned-asset' : null))
  create.mockImplementation(async (_type, _id, data) => {
    persisted.push(data)
    return true
  })
  update.mockImplementation(async (_type, _id, patch) => {
    persisted.push(patch)
    return true
  })
  const market = useMarketStore()
  market.addInstrument({
    investmentAssetId: 'asset',
    type: 'etf',
    symbol: 'VANGUARD',
    market: '',
    currency: 'EUR',
    provider: 'yahoo',
  })
  const [instrument] = market.instruments

  expect(market.setQuoteTicker(instrument.id, 'ie00b03hd191')).toBe(true)

  await vi.waitFor(() => {
    expect(persisted.at(-1)).toMatchObject({
      quoteConfig: { symbol: 'VANGUARD', quoteSymbol: 'IE00B03HD191', type: 'fund' },
    })
  })
})

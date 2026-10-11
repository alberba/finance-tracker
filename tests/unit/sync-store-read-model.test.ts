import 'fake-indexeddb/auto'
import { createPinia, setActivePinia } from 'pinia'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'

vi.mock('../../src/scripts/demo-mode', () => ({ isDemoMode: () => false }))

import { useFinancialStateStore } from '../../src/stores/financial-state'
import { useSyncStore } from '../../src/stores/sync'

const EMPTY = {
  revision: 0,
  settings: null,
  accounts: [],
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
const REMOTE_ACCOUNT = {
  id: 'remote-account',
  name: 'Cuenta remota',
  kind: 'cash',
  currency: 'EUR',
  openingBalance: 15,
  version: 1,
}
function json(body: unknown) {
  return new Response(JSON.stringify(body), { headers: { 'Content-Type': 'application/json' } })
}

describe('review: read model across devices', () => {
  beforeEach(() => {
    vi.stubGlobal('navigator', { onLine: true })
    vi.stubGlobal('window', new EventTarget())
    setActivePinia(createPinia())
  })
  afterEach(() => {
    vi.unstubAllGlobals()
    vi.unstubAllEnvs()
  })

  it('does not present seed accounts after bootstrap fails on a fresh device', async () => {
    vi.stubGlobal(
      'fetch',
      vi.fn(async (url: string) =>
        url === '/api/bootstrap'
          ? new Response('Worker exceeded resource limits (1102)', { status: 503 })
          : json({ revision: 0, changes: [] }),
      ),
    )
    await useSyncStore().init('review-fresh-failure')
    expect(useFinancialStateStore().accounts).toEqual([])
  })

  it('projects received changes when the full bootstrap download fails', async () => {
    let initial = true
    vi.stubGlobal(
      'fetch',
      vi.fn(async (url: string) => {
        if (url === '/api/bootstrap')
          return initial ? json(EMPTY) : new Response('1102', { status: 503 })
        return json(
          initial
            ? { revision: 0, changes: [] }
            : {
                revision: 1,
                changes: [
                  {
                    entityType: 'account',
                    entityId: REMOTE_ACCOUNT.id,
                    changeType: 'create',
                    payload: JSON.stringify(REMOTE_ACCOUNT),
                  },
                ],
              },
        )
      }),
    )
    const sync = useSyncStore()
    await sync.init('review-incremental-failure')
    initial = false
    window.dispatchEvent(new Event('online'))
    await vi.waitFor(() => expect(sync.revision).toBe(1))
    await vi.waitFor(() => expect(sync.syncStatus).toBe('idle'))
    expect(await sync.getEntityRef('account', REMOTE_ACCOUNT.id)).not.toBeNull()
    expect(useFinancialStateStore().accounts.map((account) => account.name)).toContain(
      REMOTE_ACCOUNT.name,
    )
  })

  it('retains an investment operation when a same-version incremental row omits it', async () => {
    const transaction = {
      id: 'remote-investment',
      accountId: REMOTE_ACCOUNT.id,
      categoryId: null,
      type: 'investment',
      date: '2026-09-12',
      description: 'Compra VWCE',
      amount: 1206.2,
      currency: 'EUR',
      version: 1,
      tradeDetail: {
        symbol: 'VWCE',
        side: 'buy',
        quantity: '10',
        price: 120.5,
        fee: 1.2,
        currency: 'EUR',
      },
    }
    const transactionChange = { ...transaction, declared: true }
    delete transactionChange.tradeDetail
    let initial = true
    vi.stubGlobal(
      'fetch',
      vi.fn(async (url: string) => {
        if (url === '/api/bootstrap')
          return initial
            ? json({ ...EMPTY, accounts: [REMOTE_ACCOUNT], transactions: [transaction] })
            : new Response('1102', { status: 503 })
        return json(
          initial
            ? { revision: 0, changes: [] }
            : {
                revision: 1,
                changes: [
                  {
                    entityType: 'transaction',
                    entityId: transaction.id,
                    changeType: 'update',
                    payload: JSON.stringify(transactionChange),
                  },
                ],
              },
        )
      }),
    )
    const sync = useSyncStore()
    await sync.init('review-investment-operation')
    initial = false
    window.dispatchEvent(new Event('online'))
    await vi.waitFor(() => expect(sync.revision).toBe(1))
    await vi.waitFor(() => expect(sync.syncStatus).toBe('idle'))

    expect(useFinancialStateStore().transactions[0]).toMatchObject({
      symbol: 'VWCE',
      side: 'buy',
      units: 10,
      unitPrice: 120.5,
      fee: 1.2,
      declared: true,
    })
  })
})

import { describe, expect, it } from 'vitest'

import { registerFinanceTools, type FinanceModelContext } from '../../src/lib/client/webmcp'
import { EMPTY_STATE_SEED, normalizeState } from '../../src/scripts/state'
import type { State, Transaction } from '../../src/scripts/types'

type Tool = Parameters<FinanceModelContext['registerTool']>[0]

function movement(overrides: Partial<Transaction> = {}): Transaction {
  return {
    id: 'expense',
    date: '2026-01-02',
    month: 1,
    type: 'expense',
    category: 'Comida',
    description: 'Compra semanal',
    amount: 42,
    accountId: 'account',
    ...overrides,
  }
}

async function setup() {
  let state: State = normalizeState(structuredClone(EMPTY_STATE_SEED))
  state.year = 2026
  state.currency = 'EUR'
  const tools = new Map<string, Tool>()
  await registerFinanceTools(
    {
      registerTool: async (tool) => {
        tools.set(tool.name, tool)
      },
    },
    () => state,
  )
  return {
    tools,
    replaceState: (next: State) => {
      state = next
    },
    state,
    call: async (name: string, input: unknown) => {
      const result = await tools.get(name)!.execute(input)
      return JSON.parse(result.content[0].text)
    },
  }
}

describe('WebMCP finance queries', () => {
  it('advertises default search arguments as optional', async () => {
    const { tools } = await setup()
    expect(tools.get('search_movements')!.inputSchema.required ?? []).toEqual([])
    expect(tools.get('get_month_totals')!.inputSchema.required).toEqual(['year', 'month'])
  })

  it('does not read state when the browser has no WebMCP API', async () => {
    await expect(
      registerFinanceTools(undefined, () => {
        throw new Error('Unexpected read')
      }),
    ).resolves.toBeUndefined()
  })

  it('queries the latest projection without changing movements or UI filters', async () => {
    const { state, replaceState, call } = await setup()
    expect(await call('search_movements', {})).toMatchObject({ total: 0, movements: [] })
    const updated = { ...state, transactions: [movement()] }
    replaceState(updated)
    expect(await call('search_movements', { query: 'COMPRA' })).toMatchObject({
      total: 1,
      movements: [{ amount: 42, month: 1, currency: 'EUR' }],
    })
    expect(updated.transactions).toEqual([movement()])
  })

  it('uses the accounting year at the December/January boundary for search and totals', async () => {
    const { state, call } = await setup()
    state.transactions = [movement({ date: '2025-12-28', type: 'income', month: 1, amount: 2000 })]
    expect(await call('search_movements', { year: 2026, month: 1 })).toMatchObject({ total: 1 })
    expect(await call('search_movements', { year: 2025 })).toMatchObject({ total: 0 })
    expect(await call('get_month_totals', { year: 2026, month: 1 })).toEqual({
      year: 2026,
      month: 1,
      currency: 'EUR',
      income: 2000,
      expense: 0,
      investment: 0,
      net: 2000,
    })
  })

  it('filters before paginating and preserves the movement currency', async () => {
    const { state, call } = await setup()
    state.transactions = [
      movement({ id: 'old', date: '2026-01-01' }),
      movement({ id: 'new', date: '2026-01-03', movementCurrency: 'USD' }),
      movement({ id: 'income', type: 'income' }),
    ]
    expect(
      await call('search_movements', { query: 'comida', type: 'expense', limit: 1 }),
    ).toMatchObject({
      total: 2,
      movements: [{ id: 'new', currency: 'USD' }],
    })
    expect(await call('search_movements', { type: 'expense', offset: 1, limit: 1 })).toMatchObject({
      total: 2,
      movements: [{ id: 'old' }],
    })
  })

  it('returns the budget view model for the configured year', async () => {
    const { state, call } = await setup()
    state.expenseCategories = ['Comida']
    state.budget.expense.Comida = Array(12).fill(50)
    expect(await call('get_budget', {})).toMatchObject({
      year: 2026,
      currency: 'EUR',
      types: { expense: { totals: { plannedTotal: 600 } } },
    })
  })

  it.each([
    ['search_movements', { limit: 101 }],
    ['search_movements', { month: 0 }],
    ['search_movements', { offset: -1 }],
    ['search_movements', { type: 'transfer' }],
    ['get_month_totals', { year: 2026, month: 13 }],
    ['get_budget', { year: 2025 }],
  ])('rejects invalid arguments to %s', async (name, input) => {
    const { tools } = await setup()
    expect(await tools.get(name)!.execute(input)).toMatchObject({ isError: true })
  })
})

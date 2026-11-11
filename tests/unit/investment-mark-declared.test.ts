// @vitest-environment happy-dom
import { createPinia, setActivePinia } from 'pinia'
import { beforeEach, describe, expect, it } from 'vitest'

import { normalizeState } from '../../src/scripts/state'
import type { Transaction } from '../../src/scripts/types'
import { useFinancialStateStore } from '../../src/stores/financial-state'
import { useInvestmentStore } from '../../src/stores/investment'

function buy(id: string, declared: boolean): Transaction {
  return {
    id,
    date: '2026-01-10',
    month: 1,
    type: 'investment',
    accountId: 'broker',
    category: 'Fondos',
    description: 'Compra 1 VWCE',
    amount: 100,
    symbol: 'VWCE',
    side: 'buy',
    unitPrice: 100,
    units: 1,
    fee: 0,
    declared,
  }
}

beforeEach(() => {
  setActivePinia(createPinia())
  document.body.innerHTML = '<div id="toast"></div>'
  useFinancialStateStore().replaceState(
    normalizeState({
      accounts: [{ id: 'broker', name: 'Broker', openingBalance: 0 }],
      investmentAssets: [{ id: 'fondos', name: 'Fondos', openingBalance: 0 }],
      transactions: [buy('a', false), buy('b', false), buy('c', false)],
    }),
  )
})

describe('markDeclared', () => {
  it('marca como declarados solo los movimientos pedidos', () => {
    useInvestmentStore().markDeclared(['a', 'b'])
    const declared = useFinancialStateStore().transactions.map((tx) => [tx.id, tx.declared])
    expect(declared).toEqual([
      ['a', true],
      ['b', true],
      ['c', false],
    ])
  })

  it('avisa una sola vez, sea cual sea el número de movimientos', () => {
    useInvestmentStore().markDeclared(['a', 'b'])
    expect(document.getElementById('toast')?.textContent).toBe(
      'Movimientos marcados como declarados.',
    )
  })
})

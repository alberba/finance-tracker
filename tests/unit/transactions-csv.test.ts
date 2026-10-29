import { describe, expect, it } from 'vitest'

import { transactionsToCsv } from '../../src/domain/data/view-model'
import type { Transaction } from '../../src/scripts/types'

const movement: Transaction = {
  id: 'cafe',
  date: '2026-09-03',
  month: 9,
  type: 'expense',
  accountId: 'bbva',
  category: 'Bares',
  description: 'Café "con leche"',
  amount: 1.8,
}

describe('transactionsToCsv', () => {
  it('writes the header and one quoted row per movement, escaping quotes', () => {
    const [header, row] = transactionsToCsv([movement]).split('\n')

    expect(header).toBe(
      '"id","date","month","type","accountId","category","description","amount","time","symbol","side","unitPrice","units","fee","movementCurrency","declared"',
    )
    expect(row).toBe(
      '"cafe","2026-09-03","9","expense","bbva","Bares","Café ""con leche""","1.8","","","","","","","","false"',
    )
  })

  it('is just the header for no movements', () => {
    expect(transactionsToCsv([]).split('\n')).toHaveLength(1)
  })
})

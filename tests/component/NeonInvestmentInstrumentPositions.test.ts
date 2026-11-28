import { mount } from '@vue/test-utils'
import { describe, expect, it } from 'vitest'

import { buildInvestmentDashboardViewModel } from '../../src/domain/investment/view-model'
import type { Month } from '../../src/lib/month'
import { instrumentDetail } from '../../src/neon/sections/investment/instrument-view-model'
import NeonInvestmentInstrumentPositions from '../../src/neon/sections/investment/NeonInvestmentInstrumentPositions.vue'
import { normalizeState } from '../../src/scripts/state'

function buy(id: string, month: Month, units: number, price: number, extra = {}) {
  return {
    id,
    date: `2026-0${month}-10`,
    month,
    type: 'investment',
    accountId: 'cash',
    category: 'Crypto',
    description: 'Compra ETH',
    amount: units * price,
    side: 'buy',
    units,
    unitPrice: price,
    symbol: 'ETH',
    ...extra,
  }
}

/** ETH in Crypto (10 at 100 €) and in Bitvavo (4 at 120 €); no quote for it. */
function ethDetail() {
  const state = normalizeState({
    year: 2026,
    currency: 'EUR',
    accounts: [{ id: 'cash', name: 'Cuenta', openingBalance: 0 }],
    investmentAssets: [
      { id: 'crypto', name: 'Crypto', openingBalance: 0 },
      { id: 'bitvavo', name: 'Bitvavo', openingBalance: 0 },
    ],
    liabilities: [],
    instruments: [
      {
        id: 'i-eth',
        investmentAssetId: 'crypto',
        type: 'crypto',
        symbol: 'ETH',
        market: '',
        currency: 'EUR',
        provider: 'yahoo',
        active: true,
      },
    ],
    quotes: {},
    transactions: [
      buy('t1', 1, 10, 100, { instrumentId: 'i-eth' }),
      buy('t2', 2, 4, 120, { category: 'Bitvavo' }),
    ],
    snapshots: {
      '3': { month: 3, accounts: {}, investments: { crypto: 1200, bitvavo: 600 }, liabilities: {} },
    },
    contributions: [],
  })
  const vm = buildInvestmentDashboardViewModel(state, 3, 'simple', { quotes: true })
  return instrumentDetail(state, vm, 'i-eth')!
}

describe('NeonInvestmentInstrumentPositions', () => {
  it('lista una línea por cuenta y el total debajo', () => {
    const { positions, total, unpricedNote } = ethDetail()
    const wrapper = mount(NeonInvestmentInstrumentPositions, {
      props: { positions, total, note: unpricedNote },
    })

    expect(
      wrapper
        .findAll('[data-instrument-position]')
        .map((row) => row.attributes('data-instrument-position')),
    ).toEqual(['crypto', 'bitvavo'])
    expect(wrapper.get('[data-instrument-position="crypto"]').text()).toContain('1.200,00')
    expect(wrapper.get('[data-instrument-position="bitvavo"]').text()).toContain('600,00')
    expect(wrapper.get('[data-instrument-total]').text()).toContain('14')
    expect(wrapper.get('[data-instrument-total]').text()).toContain('1.800,00')
  })

  it('en móvil apila cada cuenta con sus cifras y su total', () => {
    const { positions, total, unpricedNote } = ethDetail()
    const wrapper = mount(NeonInvestmentInstrumentPositions, {
      props: { positions, total, note: unpricedNote, stacked: true },
    })

    expect(wrapper.get('[data-instrument-position="crypto"]').text()).toContain('10 títulos')
    expect(wrapper.get('[data-instrument-total]').text()).toContain('1.800,00')
  })

  it('sin cotización marca cada cuenta como estimada', () => {
    const { positions, total, unpricedNote } = ethDetail()
    const wrapper = mount(NeonInvestmentInstrumentPositions, {
      props: { positions, total, note: unpricedNote },
    })

    expect(wrapper.get('[data-instrument-position="crypto"]').text()).toContain('Sin cotización')
  })

  it('sin posiciones lo dice en vez de dejar una tabla vacía', () => {
    const wrapper = mount(NeonInvestmentInstrumentPositions, {
      props: { positions: [], total: null, note: null },
    })

    expect(wrapper.find('[data-instrument-no-positions]').exists()).toBe(true)
    expect(wrapper.find('[data-instrument-total]').exists()).toBe(false)
  })
})

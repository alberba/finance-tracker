import { mount } from '@vue/test-utils'
import { describe, expect, it } from 'vitest'

import { buildPositionEvolution } from '../../src/domain/investment/position-evolution'
import { buildInvestmentDashboardViewModel } from '../../src/domain/investment/view-model'
import type { Month } from '../../src/lib/month'
import { assetDetail } from '../../src/neon/sections/investment/asset-view-model'
import NeonInvestmentAssetPositions from '../../src/neon/sections/investment/NeonInvestmentAssetPositions.vue'
import { normalizeState } from '../../src/scripts/state'

function buy(
  id: string,
  month: Month,
  instrumentId: string,
  symbol: string,
  units: number,
  price: number,
) {
  return {
    id,
    date: `2026-0${month}-10`,
    month,
    type: 'investment',
    accountId: 'cash',
    category: 'Crypto',
    description: `Compra ${symbol}`,
    amount: units * price,
    side: 'buy',
    units,
    unitPrice: price,
    symbol,
    instrumentId,
  }
}

function cryptoDetail(withEvolution = false) {
  const instrument = (id: string, symbol: string) => ({
    id,
    investmentAssetId: 'crypto',
    type: 'crypto',
    symbol,
    market: '',
    currency: 'EUR',
    provider: 'yahoo',
    active: true,
  })
  const state = normalizeState({
    year: 2026,
    currency: 'EUR',
    accounts: [{ id: 'cash', name: 'Cuenta', openingBalance: 0 }],
    investmentAssets: [{ id: 'crypto', name: 'Crypto', openingBalance: 0 }],
    liabilities: [],
    instruments: [instrument('i-btc', 'BTC'), instrument('i-eth', 'ETH')],
    // Only BTC has a quote: ETH is an estimate.
    quotes: {
      'i-btc': {
        instrumentId: 'i-btc',
        price: 5000,
        currency: 'EUR',
        timestamp: '2026-03-10T10:00:00.000Z',
        fetchedAt: '2026-03-10T10:00:00.000Z',
        dataType: 'live',
        source: 'test',
        status: 'fresh',
        isStale: false,
        previousClose: null,
        changePercent: null,
      },
    },
    transactions: [buy('t1', 1, 'i-btc', 'BTC', 2, 2000), buy('t2', 2, 'i-eth', 'ETH', 10, 100)],
    snapshots: { '3': { month: 3, accounts: {}, investments: { crypto: 12000 }, liabilities: {} } },
    contributions: [],
  })
  const vm = buildInvestmentDashboardViewModel(state, 3, 'simple', { quotes: true })
  // BTC has monthly closes; ETH has none and takes its share of the account.
  const evolution = withEvolution
    ? buildPositionEvolution(state, 'crypto', 3, { 'i-btc': [1800, 1900, 2500, 5000] })
    : undefined
  return assetDetail(state, vm, 'crypto', { evolution })!
}

describe('NeonInvestmentAssetPositions', () => {
  it('lista BTC y ETH de la cuenta con sus cifras y marca solo la que no tiene cotización', () => {
    const { positions, unpricedNote } = cryptoDetail()
    const wrapper = mount(NeonInvestmentAssetPositions, {
      props: { positions, note: unpricedNote },
    })

    const btc = wrapper.get('[data-asset-position-line="BTC"]').text()
    const eth = wrapper.get('[data-asset-position-line="ETH"]').text()
    expect(btc).toContain('10.000,00')
    expect(btc).toContain('2.000,00')
    expect(btc).not.toContain('Sin cotización')
    expect(eth).toContain('Sin cotización')
    expect(eth).toContain('2.000,00')
  })

  it('en móvil apila cada posición con las mismas cifras', () => {
    const { positions, unpricedNote } = cryptoDetail()
    const wrapper = mount(NeonInvestmentAssetPositions, {
      props: { positions, note: unpricedNote, stacked: true },
    })

    expect(
      wrapper
        .findAll('[data-asset-position-line]')
        .map((row) => row.attributes('data-asset-position-line')),
    ).toEqual(['BTC', 'ETH'])
    expect(wrapper.get('[data-asset-position-line="BTC"]').text()).toContain('2 · media 2.000,00')
  })

  it('dibuja la evolución de cada posición y avisa de que la que no tiene histórico es aproximada', () => {
    const { positions, unpricedNote } = cryptoDetail(true)
    const wrapper = mount(NeonInvestmentAssetPositions, {
      props: { positions, note: unpricedNote },
    })

    const btc = wrapper.get('[data-position-evolution="BTC"]')
    const eth = wrapper.get('[data-position-evolution="ETH"]')
    expect(btc.attributes('role')).toBe('img')
    expect(btc.attributes('aria-label')).toBe(
      'Evolución de BTC: de 3.800,00\u00a0€ en ene a 10.000,00\u00a0€ en mar',
    )
    expect(eth.attributes('aria-label')).toContain('Evolución aproximada de ETH')
  })

  it('sin evolución calculada no dibuja ninguna', () => {
    const { positions, unpricedNote } = cryptoDetail()
    const wrapper = mount(NeonInvestmentAssetPositions, {
      props: { positions, note: unpricedNote },
    })

    expect(wrapper.find('[data-position-evolution]').exists()).toBe(false)
  })

  it.each([false, true])(
    'cada posición lleva al detalle de su instrumento (apilada: %s)',
    async (stacked) => {
      const { positions, unpricedNote } = cryptoDetail()
      const wrapper = mount(NeonInvestmentAssetPositions, {
        props: { positions, note: unpricedNote, stacked },
      })

      const link = wrapper.get('[data-asset-position-line="ETH"] a')
      expect(link.attributes('href')).toBe('/inversion?instrumento=i-eth')
      await link.trigger('click')
      expect(wrapper.emitted('open')).toEqual([['i-eth']])
    },
  )

  it.each([false, true])(
    'añade «Sin instrumento» con su valor y lo invertido, sin enlace (apilada: %s)',
    (stacked) => {
      const { positions, unpricedNote } = cryptoDetail()
      const uninstrumented = {
        value: '180,00\u00a0€',
        invested: '200,00\u00a0€',
        gain: '−20,00\u00a0€',
        ret: '−10,0\u00a0%',
        tone: 'loss' as const,
      }
      const wrapper = mount(NeonInvestmentAssetPositions, {
        props: { positions, note: unpricedNote, uninstrumented, stacked },
      })

      const row = wrapper.get('[data-asset-uninstrumented]')
      expect(row.text()).toContain('Sin instrumento')
      expect(row.text()).toContain('180,00')
      expect(row.text()).toContain('200,00')
      expect(row.find('a').exists()).toBe(false)
    },
  )

  it('sin capital sin instrumento no añade la fila', () => {
    const { positions, unpricedNote } = cryptoDetail()
    const wrapper = mount(NeonInvestmentAssetPositions, {
      props: { positions, note: unpricedNote, uninstrumented: null },
    })

    expect(wrapper.find('[data-asset-uninstrumented]').exists()).toBe(false)
  })
})

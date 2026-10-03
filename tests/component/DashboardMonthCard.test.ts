import { mount } from '@vue/test-utils'
import { describe, expect, it } from 'vitest'

import DashboardMonthCard from '../../src/components/dashboard/DashboardMonthCard.vue'
import type { DashboardIncomeSplit, DashboardKpi } from '../../src/domain/dashboard/view-model'

const expense: DashboardKpi = {
  kind: 'expense',
  label: 'Gastos',
  value: '1.055,99 €',
  previous: 'Agosto: 1.380,30 €',
  change: { label: '23,50 %', trend: 'down', tone: 'good' },
  bars: [
    { month: 'Julio', height: 60, current: false },
    { month: 'Agosto', height: 100, current: false },
    { month: 'Septiembre', height: 76.5, current: true },
  ],
}

const flat: DashboardKpi = {
  ...expense,
  kind: 'investment',
  label: 'Ahorro o inversión',
  change: { label: '0,00 %', trend: 'flat', tone: 'neutral' },
}

const split: DashboardIncomeSplit = {
  segments: [
    { key: 'expense', label: 'Gastos', weight: 40, share: '40,00 %' },
    { key: 'investment', label: 'Inversión', weight: 10, share: '10,00 %' },
    { key: 'unspent', label: 'Sin gastar', weight: 50, share: '50,00 %' },
  ],
  keptPer100: '50,00 €',
  unspent: '1.000,00 €',
}

function mountCard(kpis: DashboardKpi[], incomeSplit: DashboardIncomeSplit | null = split) {
  return mount(DashboardMonthCard, {
    props: {
      monthName: 'Septiembre',
      status: 'Mes en curso · día 28 de 30',
      kpis,
      split: incomeSplit,
      months: [{ value: 8, label: 'Septiembre' }],
      years: [2026],
      month: 8,
      year: 2026,
    },
  })
}

describe('DashboardMonthCard', () => {
  it('names each figure with its change against the previous month', () => {
    const kpi = mountCard([expense]).get('[data-kpi="expense"]')

    expect(kpi.attributes('aria-label')).toBe(
      'Gastos: 1.055,99 €, baja 23,50 % frente al mes anterior',
    )
    expect(kpi.get('[data-kpi-change]').attributes('data-tone')).toBe('good')
    expect(kpi.text()).toContain('Agosto: 1.380,30 €')
  })

  it('reads an unchanged figure as neutral', () => {
    const kpi = mountCard([flat]).get('[data-kpi="investment"]')

    expect(kpi.get('[data-kpi-change]').attributes('data-tone')).toBe('neutral')
    expect(kpi.attributes('aria-label')).toContain('sin cambios frente al mes anterior')
  })

  it('dims every month bar but the current one', () => {
    const bars = mountCard([expense]).findAll('[data-kpi="expense"] [title] span')

    expect(bars.map((bar) => bar.attributes('style'))).toEqual([
      'height: 60%;',
      'height: 100%;',
      'height: 76.5%;',
    ])
    expect(bars.map((bar) => bar.classes('opacity-30'))).toEqual([true, true, false])
  })

  it('tells what is left of every 100 that came in', () => {
    const block = mountCard([expense]).get('[data-income-split]')

    expect(block.text()).toContain('te quedan 50,00 €')
    expect(block.get('[role="img"]').attributes('aria-label')).toBe(
      'Reparto de los ingresos: gastos 40,00 %, inversión 10,00 %, sin gastar 50,00 %',
    )
  })

  it('leaves the split out without income', () => {
    expect(mountCard([expense], null).find('[data-income-split]').exists()).toBe(false)
  })

  it('locks the year when there is only one', () => {
    expect(mountCard([expense]).get('#year-display').attributes('disabled')).toBeDefined()
  })
})

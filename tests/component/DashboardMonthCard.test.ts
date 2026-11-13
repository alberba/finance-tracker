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
    { month: 'Julio', value: '828,18 €', height: 60, current: false },
    { month: 'Agosto', value: '1.380,30 €', height: 100, current: false },
    { month: 'Septiembre', value: '1.055,99 €', height: 76.5, current: true },
  ],
}

const flat: DashboardKpi = {
  ...expense,
  kind: 'investment',
  label: 'Ahorro e inversión',
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

  it.each([
    { interaction: 'hover', enter: 'mousemove', leave: 'mouseleave' },
    { interaction: 'keyboard focus', enter: 'focus', leave: 'blur' },
  ])(
    'previews successive monthly amounts on $interaction and restores them on leave',
    async ({ enter, leave }) => {
      const wrapper = mountCard([expense])
      const bars = wrapper.findAll('[data-kpi="expense"] button')

      await bars[0].trigger(enter)
      expect(wrapper.get('#kpi-expense').text()).toBe('828,18 €')
      await bars[0].trigger(leave)
      await bars[1].trigger(enter)
      expect(wrapper.get('#kpi-expense').text()).toBe('1.380,30 €')
      await bars[1].trigger(leave)
      expect(wrapper.get('#kpi-expense').text()).toBe(expense.value)
    },
  )

  it('keeps the monthly bar heights', () => {
    const bars = mountCard([expense]).findAll<HTMLSpanElement>('[data-kpi="expense"] button span')

    expect(bars.map((bar) => bar.element.style.blockSize)).toEqual(['60%', '100%', '76.5%'])
  })

  it('names each bar with its KPI, month and amount', () => {
    const bar = mountCard([expense]).get('[data-kpi="expense"] button')
    expect(bar.attributes('aria-label')).toBe('Gastos, Julio: 828,18 €')
  })

  it('keeps other KPI amounts unchanged during preview', async () => {
    const wrapper = mountCard([expense, flat])
    await wrapper.get('[data-kpi="expense"] button').trigger('mousemove')
    expect(wrapper.get('#kpi-investment').text()).toBe(flat.value)
  })

  it('keeps the selected month comparison during preview', async () => {
    const wrapper = mountCard([expense])
    await wrapper.get('[data-kpi="expense"] button').trigger('mousemove')
    expect(wrapper.get('[data-kpi-change]').text()).toBe('23,50 %')
    expect(wrapper.get('[data-kpi="expense"]').text()).toContain('Agosto: 1.380,30 €')
  })

  it('does not emit period changes when querying a bar', async () => {
    const wrapper = mountCard([expense])
    const bar = wrapper.get('[data-kpi="expense"] button')
    await bar.trigger('mousemove')
    await bar.trigger('focus')
    expect([wrapper.emitted('update:month'), wrapper.emitted('update:year')]).toEqual([
      undefined,
      undefined,
    ])
  })

  it('returns to the focused bar when hover ends and keeps hover when focus ends', async () => {
    const wrapper = mountCard([expense])
    const bars = wrapper.findAll('[data-kpi="expense"] button')

    await bars[0].trigger('focus')
    await bars[1].trigger('mousemove')
    expect(wrapper.get('#kpi-expense').text()).toBe('1.380,30 €')
    await bars[1].trigger('mouseleave')
    expect(wrapper.get('#kpi-expense').text()).toBe('828,18 €')
    await bars[1].trigger('mousemove')
    await bars[0].trigger('blur')
    expect(wrapper.get('#kpi-expense').text()).toBe('1.380,30 €')
    await bars[1].trigger('mouseleave')
    expect(wrapper.get('#kpi-expense').text()).toBe(expense.value)
  })

  it('lets keyboard focus take over from hover and returns to hover on blur', async () => {
    const wrapper = mountCard([expense])
    const bars = wrapper.findAll('[data-kpi="expense"] button')

    await bars[0].trigger('mousemove')
    await bars[1].trigger('focus')
    expect(wrapper.get('#kpi-expense').text()).toBe('1.380,30 €')
    await bars[1].trigger('blur')
    expect(wrapper.get('#kpi-expense').text()).toBe('828,18 €')
    await bars[0].trigger('mouseleave')
    expect(wrapper.get('#kpi-expense').text()).toBe(expense.value)
  })

  it('previews a zero amount instead of falling back to the selected month', async () => {
    const wrapper = mountCard([
      { ...expense, bars: [{ month: 'Agosto', value: '0,00 €', height: 0, current: false }] },
    ])

    await wrapper.get('[data-kpi="expense"] button').trigger('mousemove')
    expect(wrapper.get('#kpi-expense').text()).toBe('0,00 €')
  })

  it.each([{ month: 9 }, { year: 2027 }])(
    'discards hover and focus previews when the period changes to %j',
    async (period) => {
      const wrapper = mountCard([expense])
      const bars = wrapper.findAll('[data-kpi="expense"] button')
      await bars[0].trigger('focus')
      await bars[1].trigger('mousemove')

      await wrapper.setProps({
        ...period,
        kpis: [{ ...expense, value: '2.500,00 €' }],
      })

      expect(wrapper.get('#kpi-expense').text()).toBe('2.500,00 €')
      await bars[1].trigger('mouseleave')
      expect(wrapper.get('#kpi-expense').text()).toBe('2.500,00 €')
    },
  )

  it('uses updated bar amounts when the currency or monthly data changes', async () => {
    const wrapper = mountCard([expense])
    await wrapper.get('[data-kpi="expense"] button').trigger('focus')

    await wrapper.setProps({
      kpis: [{ ...expense, bars: [{ ...expense.bars[0], value: '1.234,50 US$' }] }],
    })

    expect(wrapper.get('#kpi-expense').text()).toBe('1.234,50 US$')
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

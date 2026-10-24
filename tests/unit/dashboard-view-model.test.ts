import { describe, expect, it } from 'vitest'

import {
  buildIncomeSplit,
  buildKpi,
  buildMonthStatus,
  buildNetWorthBand,
} from '../../src/domain/dashboard/view-model'
import { formatMoney, formatPercent, formatSignedMoney } from '../../src/lib/format'

const money = (value: number) => `${value.toFixed(2)} €`

/** Twelve monthly totals with the given values from January on. */
function year(...values: number[]): number[] {
  return Array.from({ length: 12 }, (_, index) => values[index] ?? 0)
}

describe('buildKpi', () => {
  it('compares the month with the previous one and names that month', () => {
    const kpi = buildKpi('income', year(2000, 2450, 2630), 3, money)

    expect(kpi.value).toBe('2630.00 €')
    expect(kpi.previous).toBe('Febrero: 2450.00 €')
    expect(kpi.change).toEqual({ label: formatPercent(7.35), trend: 'up', tone: 'good' })
  })

  it('reads a drop in expenses as good', () => {
    const kpi = buildKpi('expense', year(1380.3, 1055.99), 2, money)

    expect(kpi.change).toMatchObject({ trend: 'down', tone: 'good' })
  })

  it('reads a rise in expenses as bad', () => {
    const kpi = buildKpi('expense', year(1000, 1200), 2, money)

    expect(kpi.change).toMatchObject({ trend: 'up', tone: 'bad' })
  })

  it('is flat and neutral when nothing changes', () => {
    const kpi = buildKpi('investment', year(300, 300), 2, money)

    expect(kpi.change).toEqual({ label: formatPercent(0), trend: 'flat', tone: 'neutral' })
  })

  it('has no change nor previous month in January', () => {
    const kpi = buildKpi('income', year(2000), 1, money)

    expect(kpi.change).toBeNull()
    expect(kpi.previous).toBeNull()
  })

  it('has no change when the previous month is zero', () => {
    expect(buildKpi('income', year(0, 500), 2, money).change).toBeNull()
  })

  it('draws the last six months, scaled to the highest, with the current one marked', () => {
    const kpi = buildKpi('income', year(100, 200, 300, 400, 500, 600, 800), 7, money)

    expect(kpi.bars.map((bar) => bar.height)).toEqual([25, 37.5, 50, 62.5, 75, 100])
    expect(kpi.bars.map((bar) => bar.current)).toEqual([false, false, false, false, false, true])
    expect(kpi.bars[0].month).toBe('Febrero')
  })

  it('draws fewer bars early in the year', () => {
    expect(buildKpi('income', year(100, 200), 2, money).bars).toHaveLength(2)
  })

  it('keeps each monthly amount with the configured monetary format, including zero and losses', () => {
    const kpi = buildKpi('investment', year(0, -1234.5, 2500.75), 3, (value) =>
      formatMoney(value, 'USD'),
    )

    expect(kpi.bars.map((bar) => bar.value)).toEqual(['0,00 US$', '−1.234,50 US$', '2.500,75 US$'])
  })
})

describe('buildIncomeSplit', () => {
  it('splits the income into expenses, investment and what is left', () => {
    const split = buildIncomeSplit({ income: 2000, expense: 800, saving: 0, investment: 200 }, money)

    expect(split?.segments).toEqual([
      { key: 'expense', label: 'Gastos', weight: 40, share: formatPercent(40) },
      { key: 'saving', label: 'Ahorro', weight: 0, share: formatPercent(0) },
      { key: 'investment', label: 'Inversión', weight: 10, share: formatPercent(10) },
      { key: 'unspent', label: 'Sin gastar', weight: 50, share: formatPercent(50) },
    ])
    expect(split?.keptPer100).toBe('50.00 €')
    expect(split?.unspent).toBe('1000.00 €')
  })

  it('leaves nothing unspent when spending passes the income', () => {
    const split = buildIncomeSplit({ income: 1000, expense: 900, saving: 0, investment: 300 }, money)

    expect(split?.segments.map((segment) => segment.weight)).toEqual([75, 0, 25, 0])
    expect(split?.keptPer100).toBe('0.00 €')
  })

  it('is null without income', () => {
    expect(buildIncomeSplit({ income: 0, expense: 50, saving: 0, investment: 0 }, money)).toBeNull()
  })
})

describe('buildNetWorthBand', () => {
  it('compares the net worth with the previous month and with January', () => {
    const band = buildNetWorthBand(year(40000, 47028.3, 48312.4), 3, 'EUR')

    expect(band.value).toBe(formatMoney(48312.4))
    expect(band.monthChange).toEqual({
      share: formatPercent(2.73, { signed: true }),
      amount: formatSignedMoney(1284.1),
      against: 'febrero',
      tone: 'gain',
    })
    expect(band.yearChange).toEqual({
      label: `${formatSignedMoney(8312.4)} · ${formatPercent(20.78, { signed: true })}`,
      tone: 'gain',
    })
  })

  it('marks a fall as a loss', () => {
    const band = buildNetWorthBand(year(1000, 900), 2, 'EUR')

    expect(band.monthChange?.tone).toBe('loss')
    expect(band.monthChange?.amount).toBe(formatSignedMoney(-100))
  })

  it('has no changes in January', () => {
    const band = buildNetWorthBand(year(1000), 1, 'EUR')

    expect(band.monthChange).toBeNull()
    expect(band.yearChange).toBeNull()
  })
})

describe('buildMonthStatus', () => {
  it('counts the days of the month in course', () => {
    expect(buildMonthStatus(9, 2026, '2026-09-28')).toBe('Mes en curso · día 28 de 30')
  })

  it('calls a past month closed', () => {
    expect(buildMonthStatus(8, 2026, '2026-09-28')).toBe('Mes cerrado')
  })

  it('calls a later month upcoming', () => {
    expect(buildMonthStatus(10, 2026, '2026-09-28')).toBe('Mes por empezar')
  })
})

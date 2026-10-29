import { flushPromises, mount } from '@vue/test-utils'
import { createPinia, setActivePinia } from 'pinia'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'

import MonthlyReportPanel from '../../src/components/transactions/MonthlyReportPanel.vue'
import { downloadBlob } from '../../src/lib/client/download'
import { downloadMonthlyReportPdf } from '../../src/lib/client/monthly-report-pdf'
import { useFinancialStateStore } from '../../src/stores/financial-state'
import { useUiStore } from '../../src/stores/ui'
import type { Month } from '../../src/lib/month'
import type { Transaction } from '../../src/scripts/types'

vi.mock('../../src/lib/client/monthly-report-pdf', () => ({
  downloadMonthlyReportPdf: vi.fn(() => Promise.resolve()),
}))
vi.mock('../../src/lib/client/download', () => ({ downloadBlob: vi.fn() }))

function movement(id: string, date: string, extra: Partial<Transaction> = {}): Transaction {
  return {
    id,
    date,
    month: Number(date.slice(5, 7)) as Month,
    type: 'expense',
    category: 'Hogar',
    amount: 100,
    description: id,
    accountId: 'acc-1',
    ...extra,
  }
}

describe('MonthlyReportPanel', () => {
  beforeEach(() => {
    vi.useFakeTimers({ toFake: ['Date'] })
    vi.setSystemTime(new Date('2026-10-29T12:00:00'))
    setActivePinia(createPinia())
    vi.mocked(downloadMonthlyReportPdf).mockClear()
    vi.mocked(downloadBlob).mockClear()
    useFinancialStateStore().replaceState({
      year: 2026,
      currency: 'EUR',
      accounts: [{ id: 'acc-1', name: 'BBVA', openingBalance: 0 }],
      investmentAssets: [],
      liabilities: [],
      incomeCategories: ['Nómina'],
      expenseCategories: ['Hogar'],
      investmentCategories: [],
      transactions: [
        movement('alquiler', '2026-09-02'),
        movement('nomina', '2026-09-28', { type: 'income', amount: 2000, category: 'Nómina' }),
        movement('octubre', '2026-10-05'),
      ],
      snapshots: {},
      budget: { income: {}, expense: {}, investment: {} },
      goals: {},
      contributions: [],
      recurringRules: [],
      pendingMovements: [],
      instruments: [],
      quotes: {},
    })
  })

  afterEach(() => {
    vi.useRealTimers()
  })

  function setup() {
    const wrapper = mount(MonthlyReportPanel, {
      attachTo: document.body,
      props: { open: true, 'onUpdate:open': () => {} },
    })
    const from = () => wrapper.get('input[name="reportFrom"]')
    const to = () => wrapper.get('input[name="reportTo"]')
    const pdf = () => wrapper.get('[data-report-pdf]')
    const csv = () => wrapper.get('[data-report-csv]')
    return { wrapper, from, to, pdf, csv }
  }

  it('se abre con el mes anterior completo y resume lo que incluye', () => {
    const { wrapper, from, to } = setup()

    expect((from().element as HTMLInputElement).value).toBe('2026-09-01')
    expect((to().element as HTMLInputElement).value).toBe('2026-09-30')
    expect(wrapper.get('[data-report-summary]').text()).toContain('1 sept 2026 – 30 sept 2026')
    expect(wrapper.get('[data-report-summary]').text()).toContain('2 movimientos')
    expect(wrapper.text()).toContain('Incluye todos los movimientos del periodo.')
    wrapper.unmount()
  })

  it('recalcula al cambiar las fechas y «Mes anterior» las restaura', async () => {
    const { wrapper, from, to } = setup()

    await from().setValue('2026-10-01')
    await to().setValue('2026-10-29')
    expect(wrapper.get('[data-report-summary]').text()).toContain('1 movimiento')

    await wrapper.get('[data-report-previous-month]').trigger('click')
    expect((from().element as HTMLInputElement).value).toBe('2026-09-01')
    expect((to().element as HTMLInputElement).value).toBe('2026-09-30')
    wrapper.unmount()
  })

  it.each([
    ['una fecha vacía', '', '2026-09-30', /dos fechas/],
    ['«Desde» posterior a «Hasta»', '2026-09-30', '2026-09-01', /posterior/],
    ['«Hasta» en el futuro', '2026-10-01', '2026-10-30', /futura/],
  ])('con %s muestra el error y deshabilita las descargas', async (_name, start, end, message) => {
    const { wrapper, from, to, pdf, csv } = setup()

    await from().setValue(start)
    await to().setValue(end)

    expect(wrapper.get('[data-report-error]').text()).toMatch(message)
    expect(wrapper.find('[data-report-summary]').exists()).toBe(false)
    expect(pdf().attributes('disabled')).toBeDefined()
    expect(csv().attributes('disabled')).toBeDefined()
    wrapper.unmount()
  })

  it('un periodo sin movimientos es válido y avisa de que saldrá con ceros', async () => {
    const { wrapper, from, to, pdf } = setup()

    await from().setValue('2026-01-01')
    await to().setValue('2026-01-31')

    expect(wrapper.find('[data-report-error]').exists()).toBe(false)
    expect(wrapper.text()).toContain('saldrá con ceros')
    expect(pdf().attributes('disabled')).toBeUndefined()
    wrapper.unmount()
  })

  it('lista los filtros activos del registro y no aplica el año', () => {
    const ui = useUiStore()
    ui.ui.txYear = 2025
    ui.ui.txFilters.types = ['income']
    const { wrapper } = setup()

    expect(wrapper.get('[data-report-filters]').text()).toBe('Filtros activos: Ingresos')
    expect(wrapper.get('[data-report-summary]').text()).toContain('1 movimiento')
    wrapper.unmount()
  })

  it('descarga el PDF del periodo elegido', async () => {
    const { wrapper, pdf } = setup()

    await pdf().trigger('click')
    await flushPromises()

    expect(downloadMonthlyReportPdf).toHaveBeenCalledTimes(1)
    const [report, period] = vi.mocked(downloadMonthlyReportPdf).mock.calls[0]
    expect(period).toEqual({ from: '2026-09-01', to: '2026-09-30' })
    expect(report.summary.income).toBe(2000)
    wrapper.unmount()
  })

  it('avisa sin romperse cuando no se puede generar el PDF', async () => {
    vi.mocked(downloadMonthlyReportPdf).mockRejectedValueOnce(new Error('offline'))
    const { wrapper, pdf } = setup()

    await pdf().trigger('click')
    await flushPromises()

    expect(wrapper.get('[data-report-download-error]').text()).toContain(
      'No se pudo generar el PDF',
    )
    expect(pdf().attributes('disabled')).toBeUndefined()
    wrapper.unmount()
  })

  it('descarga el CSV con todos los movimientos del periodo filtrados', async () => {
    useUiStore().ui.txFilters.types = ['expense']
    const { wrapper, csv } = setup()

    await csv().trigger('click')

    expect(downloadBlob).toHaveBeenCalledTimes(1)
    const [content, mime, name] = vi.mocked(downloadBlob).mock.calls[0]
    expect(name).toBe('movimientos-2026-09-01-2026-09-30.csv')
    expect(mime).toBe('text/csv;charset=utf-8')
    expect(content.split('\n')).toHaveLength(2)
    expect(content).toContain('"alquiler"')
    expect(content).not.toContain('"nomina"')
    wrapper.unmount()
  })
})

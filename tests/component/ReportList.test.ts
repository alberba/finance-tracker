import { mount } from '@vue/test-utils'
import { describe, expect, it } from 'vitest'

import ReportList from '../../src/components/reports/ReportList.vue'
import type { ReportEntry } from '../../src/domain/reports/report-entry'

const ISSUE_URL = 'https://github.com/example/finance-tracker/issues'

function entry(overrides: Partial<ReportEntry> = {}): ReportEntry {
  return {
    number: 901,
    url: `${ISSUE_URL}/901`,
    title: 'El gráfico de gastos no respeta el filtro de mes',
    state: 'OPEN',
    stateReason: null,
    submittedAt: '2026-10-18T08:32:00.000Z',
    lastSeenAt: '2026-10-24T11:00:00.000Z',
    hasUpdates: false,
    statusChangedAt: null,
    ...overrides,
  }
}

describe('ReportList', () => {
  it('marca la entrada seleccionada y avisa de las novedades', () => {
    const wrapper = mount(ReportList, {
      props: {
        reports: [entry({ hasUpdates: true }), entry({ number: 902, title: 'Exportar a PDF' })],
        selectedNumber: 901,
      },
    })

    const first = wrapper.get('[data-report-entry="901"]')
    expect(first.attributes('aria-current')).toBe('true')
    expect(first.text()).toContain('Nuevo')
    expect(wrapper.get('[data-report-entry="902"]').attributes('aria-current')).toBeUndefined()
  })

  it('muestra la issue principal cuando el reporte sigue a una duplicada', () => {
    const wrapper = mount(ReportList, {
      props: {
        reports: [
          entry({
            state: 'CLOSED',
            stateReason: 'DUPLICATE',
            followed: {
              number: 887,
              url: `${ISSUE_URL}/887`,
              title: 'Exportar movimientos a PDF y CSV',
              state: 'OPEN',
              stateReason: null,
            },
          }),
        ],
        selectedNumber: null,
      },
    })

    const text = wrapper.get('[data-report-entry="901"]').text()
    expect(text).toContain('#901')
    expect(text).toContain('#887')
    expect(text).toContain('Se sigue en #887')
  })

  it('emite el número al pulsar sin modificadores y respeta abrir en otra pestaña', async () => {
    const wrapper = mount(ReportList, {
      props: { reports: [entry()], selectedNumber: null },
    })
    const link = wrapper.get('[data-report-entry="901"]')

    await link.trigger('click', { ctrlKey: true })
    expect(wrapper.emitted('select')).toBeUndefined()

    await link.trigger('click')
    expect(wrapper.emitted('select')).toEqual([[901]])
  })
})

import { createPinia, setActivePinia } from 'pinia'
import { beforeEach, describe, expect, it } from 'vitest'

import type { AvailableReportEntry } from '../../src/domain/reports/report-entry'
import { useReportsStore } from '../../src/stores/reports'

const ISSUE_URL = 'https://github.com/example/finance-tracker/issues'

function entry(overrides: Partial<AvailableReportEntry> = {}): AvailableReportEntry {
  return {
    number: 901,
    url: `${ISSUE_URL}/901`,
    title: 'El gráfico de gastos no respeta el filtro de mes',
    state: 'OPEN',
    stateReason: null,
    submittedAt: '2026-10-18T08:32:00.000Z',
    lastSeenAt: '2026-10-24T11:00:00.000Z',
    hasUpdates: true,
    statusChangedAt: null,
    ...overrides,
  }
}

beforeEach(() => {
  setActivePinia(createPinia())
})

describe('useReportsStore.markSeenLocally', () => {
  it('descuenta la novedad de un reporte que no está en la página cargada', () => {
    const store = useReportsStore()
    store.reports = [entry({ number: 901 })]
    store.unseenCount = 1

    store.markSeenLocally(950, '2026-10-28T10:00:00.000Z', true)

    expect(store.unseenCount).toBe(0)
    expect(store.reports).toEqual([entry({ number: 901 })])
  })

  it('no descuenta si el detalle abierto no tenía novedades', () => {
    const store = useReportsStore()
    store.reports = [entry({ number: 901 })]
    store.unseenCount = 1

    store.markSeenLocally(950, '2026-10-28T10:00:00.000Z', false)

    expect(store.unseenCount).toBe(1)
  })

  it('apaga «Nuevo» y actualiza la última lectura del reporte cargado', () => {
    const store = useReportsStore()
    store.reports = [entry({ number: 901, hasUpdates: true })]
    store.unseenCount = 1

    store.markSeenLocally(901, '2026-10-28T10:00:00.000Z')

    expect(store.unseenCount).toBe(0)
    expect(store.reports).toEqual([
      entry({ number: 901, hasUpdates: false, lastSeenAt: '2026-10-28T10:00:00.000Z' }),
    ])
  })
})

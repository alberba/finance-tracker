import { mount } from '@vue/test-utils'
import { describe, expect, it } from 'vitest'

import type { ReportEntry } from '../../src/domain/reports/report-entry'
import ReportStatus from '../../src/components/reports/ReportStatus.vue'

const BASE = {
  number: 10,
  url: 'https://github.com/acme/repo/issues/10',
  title: 'Algo',
  submittedAt: '2026-10-01T00:00:00.000Z',
  lastSeenAt: '2026-10-02T00:00:00.000Z',
  hasUpdates: false,
  statusChangedAt: null,
}

function entry(overrides: Partial<ReportEntry> = {}): ReportEntry {
  return {
    ...BASE,
    state: 'OPEN',
    stateReason: null,
    ...overrides,
  } as ReportEntry
}

describe('ReportStatus', () => {
  it('muestra «Abierto» con su punto de aviso', () => {
    const wrapper = mount(ReportStatus, { props: { entry: entry() } })
    expect(wrapper.text()).toContain('Abierto')
    expect(wrapper.get('[data-status-tone="warn"]')).toBeTruthy()
  })

  it('distingue completado de no planificado', () => {
    const completed = mount(ReportStatus, {
      props: { entry: entry({ state: 'CLOSED', stateReason: 'COMPLETED' }) },
    })
    expect(completed.text()).toContain('Cerrado · Completado')

    const notPlanned = mount(ReportStatus, {
      props: { entry: entry({ state: 'CLOSED', stateReason: 'NOT_PLANNED' }) },
    })
    expect(notPlanned.text()).toContain('Cerrado · No planificado')
  })

  it('muestra a qué principal se sigue y el número original', () => {
    const wrapper = mount(ReportStatus, {
      props: {
        entry: entry({
          state: 'CLOSED',
          stateReason: 'DUPLICATE',
          followed: {
            number: 20,
            url: 'https://github.com/acme/repo/issues/20',
            title: 'Principal',
            state: 'OPEN',
            stateReason: null,
          },
        }),
      },
    })
    expect(wrapper.text()).toContain('Se sigue en #20 · Abierto')
    expect(wrapper.text()).toContain('#10 · Cerrado como duplicado')
    expect(wrapper.text()).toContain('#20')
  })

  it('avisa cuando el enlace a la principal no está disponible', () => {
    const wrapper = mount(ReportStatus, {
      props: {
        entry: entry({ state: 'CLOSED', stateReason: 'DUPLICATE', duplicateLinkUnavailable: true }),
      },
    })
    expect(wrapper.text()).toContain('El enlace a la principal no está disponible.')
  })

  it('no inventa estado para un reporte no disponible', () => {
    const wrapper = mount(ReportStatus, {
      props: { entry: { ...BASE, number: 30, unavailable: true } as ReportEntry },
    })
    expect(wrapper.text()).toContain('Reporte #30')
    expect(wrapper.text()).toContain('Este reporte ya no está disponible en GitHub')
    expect(wrapper.find('[data-status-tone]').exists()).toBe(false)
  })
})

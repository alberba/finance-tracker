import { flushPromises, mount } from '@vue/test-utils'
import { createPinia } from 'pinia'
import { nextTick } from 'vue'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'

import type { AvailableReportEntry, ReportDetail } from '../../src/domain/reports/report-entry'
import NeonReportsSection from '../../src/neon/sections/reports/NeonReportsSection.vue'

const ISSUE_URL = 'https://github.com/example/finance-tracker/issues'
const TITLE = 'El gráfico de gastos no respeta el filtro de mes'

function reportEntry(overrides: Partial<AvailableReportEntry> = {}): AvailableReportEntry {
  return {
    number: 901,
    url: `${ISSUE_URL}/901`,
    title: TITLE,
    state: 'OPEN',
    stateReason: null,
    submittedAt: '2026-10-18T08:32:00.000Z',
    lastSeenAt: '2026-10-24T11:00:00.000Z',
    hasUpdates: false,
    statusChangedAt: null,
    ...overrides,
  }
}

function reportDetail(overrides: Partial<ReportDetail> = {}): ReportDetail {
  const report = reportEntry()
  return {
    report,
    threadIssue: {
      number: 901,
      url: report.url,
      title: report.title,
      state: 'OPEN',
      stateReason: null,
    },
    thread: [],
    canComment: true,
    original: null,
    issueDescription: null,
    fetchedAt: '2026-10-24T12:00:00.000Z',
    ...overrides,
  }
}

function json(body: unknown, status = 200): Response {
  return new Response(JSON.stringify(body), {
    status,
    headers: { 'Content-Type': 'application/json' },
  })
}

function list(reports: AvailableReportEntry[], unseenCount = 0): Response {
  return json({
    ok: true,
    reports,
    hasMore: false,
    nextCursor: null,
    unseenCount,
    fetchedAt: '2026-10-24T12:00:00.000Z',
  })
}

function mountPage() {
  return mount(NeonReportsSection, { global: { plugins: [createPinia()] } })
}

beforeEach(() => {
  window.history.replaceState(null, '', '/reportes')
})

afterEach(() => {
  vi.unstubAllGlobals()
  window.history.replaceState(null, '', '/')
})

describe('NeonReportsSection', () => {
  it('muestra el estado vacío con una acción para crear un reporte', async () => {
    vi.stubGlobal(
      'fetch',
      vi.fn(async () => list([])),
    )

    const wrapper = mountPage()
    await flushPromises()

    const empty = wrapper.get('[data-empty-state]')
    expect(empty.text()).toContain('Aún no has enviado ningún reporte.')
    expect(empty.text()).toContain('Lo que envíes aparecerá aquí con su estado y su hilo.')
    expect(empty.get('button').text()).toBe('Crear reporte')
    // The header button gives way to the one in the empty state.
    expect(wrapper.findAll('button').filter((b) => b.text() === 'Crear reporte')).toHaveLength(1)
  })

  it('muestra la carga mientras llega la lista', async () => {
    vi.stubGlobal(
      'fetch',
      vi.fn(() => new Promise<Response>(() => undefined)),
    )

    const wrapper = mountPage()
    await flushPromises()

    expect(wrapper.get('[aria-busy="true"]').text()).toContain('Cargando tus reportes…')
  })

  it('lista los reportes y abre el detalle al pulsar una entrada', async () => {
    vi.stubGlobal(
      'fetch',
      vi.fn(async (input: RequestInfo | URL) => {
        const url = String(input)
        if (url.endsWith('/api/reports')) return list([reportEntry()])
        if (url.endsWith('/seen')) return new Response(null, { status: 204 })
        if (/\/api\/reports\/901$/.test(url)) return json({ ok: true, detail: reportDetail() })
        return json({ ok: false, error: 'sin ruta falsa' }, 500)
      }),
    )

    const wrapper = mountPage()
    await flushPromises()
    expect(wrapper.text()).toContain('Selecciona un reporte para ver su estado y su hilo.')

    await wrapper.get('[data-report-entry="901"]').trigger('click')
    await flushPromises()
    await nextTick()

    expect(window.location.search).toBe('?reporte=901')
    expect(wrapper.get('[data-report-detail] h2').text()).toBe(TITLE)
    expect(wrapper.get('[data-report-entry="901"]').attributes('aria-current')).toBe('true')
  })

  it('«Nuevo» y el contador se apagan al abrir el reporte', async () => {
    vi.stubGlobal(
      'fetch',
      vi.fn(async (input: RequestInfo | URL) => {
        const url = String(input)
        if (url.endsWith('/api/reports')) return list([reportEntry({ hasUpdates: true })], 1)
        if (url.endsWith('/seen')) return new Response(null, { status: 204 })
        if (/\/api\/reports\/901$/.test(url)) {
          return json({
            ok: true,
            detail: reportDetail({ report: reportEntry({ hasUpdates: true }) }),
          })
        }
        return json({ ok: false, error: 'sin ruta falsa' }, 500)
      }),
    )

    const wrapper = mountPage()
    await flushPromises()
    expect(wrapper.get('[data-report-entry="901"] [data-report-new]').text()).toBe('Nuevo')
    expect(wrapper.get('[data-report-list]').text()).toContain('1 con novedades')

    await wrapper.get('[data-report-entry="901"]').trigger('click')
    await flushPromises()

    expect(wrapper.find('[data-report-new]').exists()).toBe(false)
    expect(wrapper.get('[data-report-list]').text()).not.toContain('con novedades')
  })

  it('muestra el error de la lista y lo reintenta', async () => {
    let failed = false
    vi.stubGlobal(
      'fetch',
      vi.fn(async () => {
        if (!failed) {
          failed = true
          return json({ ok: false, error: 'No se pudo consultar GitHub. Inténtalo de nuevo.' }, 502)
        }
        return list([reportEntry()])
      }),
    )

    const wrapper = mountPage()
    await flushPromises()
    const alert = wrapper.get('[role="alert"]')
    expect(alert.text()).toContain('No se pudo consultar GitHub. Inténtalo de nuevo.')
    expect(alert.text()).toContain('Tus reportes siguen guardados; solo falta leer su estado.')

    await alert.get('button').trigger('click')
    await flushPromises()

    expect(wrapper.get('[data-report-entry="901"]').text()).toContain(TITLE)
  })

  it('un fallo del detalle ofrece reintentar sin perder la lista', async () => {
    window.history.replaceState(null, '', '/reportes?reporte=901')
    let detailCalls = 0
    vi.stubGlobal(
      'fetch',
      vi.fn(async (input: RequestInfo | URL) => {
        const url = String(input)
        if (url.endsWith('/api/reports')) return list([reportEntry()])
        if (url.endsWith('/seen')) return new Response(null, { status: 204 })
        if (/\/api\/reports\/901$/.test(url)) {
          detailCalls += 1
          return detailCalls === 1
            ? json({ ok: false, error: 'No se pudo consultar GitHub. Inténtalo de nuevo.' }, 502)
            : json({ ok: true, detail: reportDetail() })
        }
        return json({ ok: false, error: 'sin ruta falsa' }, 500)
      }),
    )

    const wrapper = mountPage()
    await flushPromises()
    const detail = wrapper.get('[data-report-detail]')
    expect(detail.get('[role="alert"]').text()).toContain('Reporte #901')
    expect(wrapper.find('[data-report-entry="901"]').exists()).toBe(true)

    await detail.get('[role="alert"] button').trigger('click')
    await flushPromises()

    expect(wrapper.get('[data-report-detail] h2').text()).toBe(TITLE)
  })
})

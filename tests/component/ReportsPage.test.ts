import { flushPromises, mount } from '@vue/test-utils'
import { createPinia } from 'pinia'
import { nextTick } from 'vue'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'

import ReportsPage from '../../src/components/reports/ReportsPage.vue'
import type { AvailableReportEntry, ReportDetail } from '../../src/domain/reports/report-entry'

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

function mountPage() {
  return mount(ReportsPage, { global: { plugins: [createPinia()] } })
}

beforeEach(() => {
  window.history.replaceState(null, '', '/reportes')
})

afterEach(() => {
  vi.unstubAllGlobals()
  window.history.replaceState(null, '', '/')
})

describe('ReportsPage', () => {
  it('muestra el estado vacío con una acción para crear un reporte', async () => {
    vi.stubGlobal(
      'fetch',
      vi.fn(async () =>
        json({
          ok: true,
          reports: [],
          hasMore: false,
          nextCursor: null,
          unseenCount: 0,
          fetchedAt: '2026-10-24T12:00:00.000Z',
        }),
      ),
    )

    const wrapper = mountPage()
    await flushPromises()

    expect(wrapper.text()).toContain('Aún no has enviado ningún reporte.')
    expect(wrapper.findAll('button').some((button) => button.text() === 'Crear reporte')).toBe(true)
  })

  it('lista los reportes y abre el detalle al pulsar una entrada', async () => {
    vi.stubGlobal(
      'fetch',
      vi.fn(async (input: RequestInfo | URL) => {
        const url = String(input)
        if (url.endsWith('/api/reports')) {
          return json({
            ok: true,
            reports: [reportEntry()],
            hasMore: false,
            nextCursor: null,
            unseenCount: 0,
            fetchedAt: '2026-10-24T12:00:00.000Z',
          })
        }
        if (url.endsWith('/seen')) return new Response(null, { status: 204 })
        if (/\/api\/reports\/901$/.test(url)) return json({ ok: true, detail: reportDetail() })
        return json({ ok: false, error: 'sin ruta falsa' }, 500)
      }),
    )

    const wrapper = mountPage()
    await flushPromises()
    await wrapper.get('[data-report-entry="901"]').trigger('click')
    await flushPromises()
    await nextTick()

    expect(window.location.search).toBe('?reporte=901')
    expect(wrapper.get('[data-report-detail] h3').text()).toBe(TITLE)
  })

  it('muestra el error de la lista y lo reintenta', async () => {
    let failed = false
    vi.stubGlobal(
      'fetch',
      vi.fn(async () => {
        if (!failed) {
          failed = true
          return json({ ok: false, error: 'GitHub no disponible' }, 502)
        }
        return json({
          ok: true,
          reports: [reportEntry()],
          hasMore: false,
          nextCursor: null,
          unseenCount: 0,
          fetchedAt: '2026-10-24T12:00:00.000Z',
        })
      }),
    )

    const wrapper = mountPage()
    await flushPromises()
    expect(wrapper.get('[role="alert"]').text()).toContain('GitHub no disponible')

    const retry = wrapper.findAll('button').find((button) => button.text() === 'Reintentar')
    await retry?.trigger('click')
    await flushPromises()

    expect(wrapper.get('[data-report-entry="901"]').text()).toContain(TITLE)
  })
})

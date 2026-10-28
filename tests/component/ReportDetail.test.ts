import { mount } from '@vue/test-utils'
import { describe, expect, it } from 'vitest'

import ReportDetail from '../../src/components/reports/ReportDetail.vue'
import type {
  ReportDetail as ReportDetailData,
  ThreadItem,
} from '../../src/domain/reports/report-entry'

const ISSUE_URL = 'https://github.com/example/finance-tracker/issues'

function threadItem(overrides: Partial<ThreadItem> = {}): ThreadItem {
  return {
    id: 700,
    kind: 'maintainer',
    author: 'ana-mantenimiento',
    createdAt: '2026-10-20T09:00:00.000Z',
    editedAt: null,
    text: 'Lo reproducimos y lo revisamos esta semana.',
    attachments: [],
    editable: false,
    ...overrides,
  }
}

function detail(overrides: Partial<ReportDetailData> = {}): ReportDetailData {
  return {
    report: {
      number: 901,
      url: `${ISSUE_URL}/901`,
      title: 'El gráfico de gastos no respeta el filtro de mes',
      state: 'OPEN',
      stateReason: null,
      submittedAt: '2026-10-18T08:32:00.000Z',
      lastSeenAt: '2026-10-24T11:00:00.000Z',
      hasUpdates: false,
      statusChangedAt: null,
    },
    threadIssue: {
      number: 901,
      url: `${ISSUE_URL}/901`,
      title: 'El gráfico de gastos no respeta el filtro de mes',
      state: 'OPEN',
      stateReason: null,
    },
    thread: [threadItem()],
    canComment: true,
    fetchedAt: '2026-10-24T12:00:00.000Z',
    ...overrides,
  }
}

function mountDetail(
  overrides: Parameters<typeof detail>[0] = {},
  status: 'ready' | 'error' = 'ready',
) {
  return mount(ReportDetail, {
    props: {
      issueNumber: 901,
      detail: detail(overrides),
      status,
      error: status === 'error' ? 'GitHub no disponible' : '',
      pending: false,
      editingCommentId: null,
      composerResetSignal: 0,
    },
  })
}

describe('ReportDetail', () => {
  it('muestra el título, el hilo y el compositor cuando el hilo está abierto', () => {
    const wrapper = mountDetail()

    expect(wrapper.get('h3').text()).toBe('El gráfico de gastos no respeta el filtro de mes')
    expect(wrapper.text()).toContain('Hilo de')
    expect(wrapper.text()).toContain('#901')
    expect(wrapper.text()).toContain('Lo reproducimos y lo revisamos esta semana.')
    expect(wrapper.get('textarea').attributes('name')).toBe('text')
  })

  it('deja el hilo en solo lectura y sin compositor cuando está cerrado', () => {
    const wrapper = mountDetail({ canComment: false })

    expect(wrapper.text()).toContain('Este reporte está cerrado: el hilo es de solo lectura.')
    expect(wrapper.find('textarea').exists()).toBe(false)
    expect(wrapper.text()).toContain('Lo reproducimos y lo revisamos esta semana.')
  })

  it('muestra el error y pide reintentar', async () => {
    const wrapper = mountDetail({}, 'error')

    const alert = wrapper.get('[role="alert"]')
    expect(alert.text()).toContain('GitHub no disponible')
    await alert.get('button').trigger('click')
    expect(wrapper.emitted('retry')).toHaveLength(1)
  })

  it('avisa cuando la issue ya no está disponible en GitHub', () => {
    const wrapper = mount(ReportDetail, {
      props: {
        issueNumber: 901,
        detail: detail({
          report: {
            number: 901,
            unavailable: true,
            submittedAt: '2026-10-18T08:32:00.000Z',
            lastSeenAt: '2026-10-24T11:00:00.000Z',
            hasUpdates: false,
          },
          thread: [],
        }),
        status: 'unavailable',
        error: '',
        pending: false,
        editingCommentId: null,
        composerResetSignal: 0,
      },
    })

    expect(wrapper.text()).toContain('Este reporte ya no está disponible en GitHub')
    expect(wrapper.find('textarea').exists()).toBe(false)
  })
})

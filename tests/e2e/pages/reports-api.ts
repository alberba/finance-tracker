import type { Page } from '@playwright/test'

import type { AvailableReportEntry } from '../../../src/domain/reports/report-entry'

// Fake `/api/reports` shared by the «Mis reportes» specs of the old and the new
// design: the list, the detail and the reply calls, without GitHub.

export type ReportEntryShape = AvailableReportEntry

export const ISSUE_URL = 'https://github.com/example/finance-tracker/issues'

export function reportEntry(overrides: Partial<ReportEntryShape> = {}): ReportEntryShape {
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

export function reportDetail(overrides: Record<string, unknown> = {}) {
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

export function threadItem(overrides: Record<string, unknown> = {}) {
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

export async function mockReportsApi(
  page: Page,
  options: {
    list?: () => ReportEntryShape[]
    loadMore?: () => ReportEntryShape[]
    detail?: () => Record<string, unknown>
    commentStatus?: number
  } = {},
) {
  await page.route('**/api/reports**', async (route) => {
    const request = route.request()
    const url = new URL(request.url())
    const method = request.method()

    if (url.pathname === '/api/reports') {
      const cursor = url.searchParams.get('cursor')
      const isNextPage = cursor !== null
      const reports =
        isNextPage && options.loadMore
          ? options.loadMore()
          : options.list
            ? options.list()
            : [reportEntry()]
      const hasMore = !isNextPage && options.loadMore !== undefined
      return route.fulfill({
        status: 200,
        json: {
          ok: true,
          reports,
          hasMore,
          nextCursor: hasMore ? '2026-10-01T00:00:00.000Z|901' : null,
          ...(cursor === null
            ? { unseenCount: reports.filter((entry) => entry.hasUpdates).length }
            : {}),
          fetchedAt: '2026-10-24T12:00:00.000Z',
        },
      })
    }

    if (url.pathname.endsWith('/seen')) return route.fulfill({ status: 204, body: '' })

    if (url.pathname.endsWith('/comments')) {
      if (options.commentStatus && options.commentStatus >= 400) {
        return route.fulfill({
          status: options.commentStatus,
          json: { ok: false, error: 'GitHub no disponible' },
        })
      }
      const posted = request.postDataJSON() as { text: string }
      return route.fulfill({
        status: 201,
        json: {
          ok: true,
          comment: threadItem({
            id: 555,
            kind: 'reporter',
            author: 'Tú',
            text: posted.text,
            editable: true,
          }),
        },
      })
    }

    const commentMatch = /\/comments\/(\d+)$/.exec(url.pathname)
    if (commentMatch && method === 'PATCH') {
      const posted = request.postDataJSON() as { text: string }
      return route.fulfill({
        status: 200,
        json: {
          ok: true,
          comment: threadItem({
            id: Number(commentMatch[1]),
            kind: 'reporter',
            author: 'Tú',
            text: posted.text,
            editable: true,
          }),
        },
      })
    }
    if (commentMatch && method === 'DELETE') {
      return route.fulfill({ status: 204, body: '' })
    }

    return route.fulfill({
      status: 200,
      json: { ok: true, detail: options.detail ? options.detail() : reportDetail() },
    })
  })
}

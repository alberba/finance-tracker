import { flushPromises } from '@vue/test-utils'
import { createPinia, setActivePinia } from 'pinia'
import { ref } from 'vue'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'

import { useReportThread } from '../../src/composables/useReportThread'
import type { ThreadItem } from '../../src/domain/reports/report-entry'

function json(body: unknown, status = 200): Response {
  return new Response(JSON.stringify(body), {
    status,
    headers: { 'Content-Type': 'application/json' },
  })
}

function detailResponse(number: number) {
  const url = `https://github.com/acme/repo/issues/${number}`
  return {
    ok: true,
    detail: {
      report: {
        number,
        url,
        title: `Reporte ${number}`,
        state: 'OPEN',
        stateReason: null,
        submittedAt: '2026-10-01T00:00:00.000Z',
        lastSeenAt: '2026-10-02T00:00:00.000Z',
        hasUpdates: true,
        statusChangedAt: null,
      },
      threadIssue: { number, url, title: `Reporte ${number}`, state: 'OPEN', stateReason: null },
      thread: [] as ThreadItem[],
      canComment: true,
      fetchedAt: '2026-10-24T12:00:00.000Z',
    },
  }
}

interface Deferred {
  promise: Promise<Response>
  resolve: (response: Response) => void
}

function deferred(): Deferred {
  let resolve!: (response: Response) => void
  const promise = new Promise<Response>((done) => {
    resolve = done
  })
  return { promise, resolve }
}

let postComment: Deferred

beforeEach(() => {
  setActivePinia(createPinia())
  postComment = deferred()
  vi.stubGlobal(
    'fetch',
    vi.fn(async (input: RequestInfo | URL, init?: RequestInit) => {
      const url = String(input)
      if (init?.method === 'POST' && url.endsWith('/comments')) return postComment.promise
      if (init?.method === 'POST' && url.endsWith('/seen'))
        return new Response(null, { status: 204 })
      const match = /\/api\/reports\/(\d+)$/.exec(url)
      if (match) return json(detailResponse(Number(match[1])))
      return json({ ok: false, error: 'sin ruta falsa' }, 500)
    }),
  )
})

afterEach(() => {
  vi.unstubAllGlobals()
})

const COMMENT: ThreadItem = {
  id: 555,
  kind: 'reporter',
  author: 'Tú',
  createdAt: '2026-10-24T12:00:00.000Z',
  editedAt: null,
  text: 'Aclaración del reporte 901',
  attachments: [],
  editable: true,
}

describe('useReportThread', () => {
  it('no aplica la respuesta de una mutación al hilo abierto después', async () => {
    const issueNumber = ref<number | null>(901)
    const thread = useReportThread(issueNumber)
    await flushPromises()
    expect(thread.detail.value?.report.number).toBe(901)

    const pending = thread.addComment({ text: 'Aclaración del reporte 901' })
    issueNumber.value = 902
    await flushPromises()
    expect(thread.detail.value?.report.number).toBe(902)

    postComment.resolve(json({ ok: true, comment: COMMENT }, 201))
    expect(await pending).toBe(false)
    expect(thread.detail.value?.report.number).toBe(902)
    expect(thread.detail.value?.thread).toEqual([])
    expect(thread.pending.value).toBe(false)
  })

  it('no muestra en el hilo B el error de una mutación del hilo A', async () => {
    const issueNumber = ref<number | null>(901)
    const thread = useReportThread(issueNumber)
    await flushPromises()

    const pending = thread.addComment({ text: 'Aclaración del reporte 901' })
    issueNumber.value = 902
    await flushPromises()

    postComment.resolve(json({ ok: false, error: 'GitHub no disponible' }, 502))
    expect(await pending).toBe(false)
    expect(thread.error.value).toBe('')
    expect(thread.detail.value?.report.number).toBe(902)
  })
})

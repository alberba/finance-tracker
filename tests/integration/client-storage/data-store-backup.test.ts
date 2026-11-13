import 'fake-indexeddb/auto'
import { setActivePinia } from 'pinia'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'

import { createTestPinia } from '../../helpers/pinia'
import { useDataStore } from '../../../src/stores/data'
import { useFinancialStateStore } from '../../../src/stores/financial-state'
import { useSyncStore } from '../../../src/stores/sync'

const EXPORT = { format: 'finance-tracker/v2-export', accounts: [{ id: 'a1', name: 'Caja' }] }
const BACKUP_TEXT = JSON.stringify(EXPORT)
const backupFile = { text: async () => BACKUP_TEXT } as File

const EMPTY_BOOTSTRAP = {
  revision: 0,
  settings: null,
  accounts: [],
  categories: [],
  transactions: [],
  subscriptions: [],
  recurringRules: [],
  pendingMovements: [],
  budgetEntries: [],
  goals: [],
  contributions: [],
  userInstruments: [],
  wealthSnapshots: [],
}

function json(body: unknown, status = 200): Response {
  return new Response(JSON.stringify(body), {
    status,
    headers: { 'Content-Type': 'application/json' },
  })
}

type Fetched = { url: string; method: string; body?: string }

let userCounter = 0
let fetched: Fetched[]
let syncResponse: () => Response
let importResponse: () => Response
let exportResponse: () => Response
let toast: { textContent: string }
let reload: ReturnType<typeof vi.fn>
let downloads: Array<{ filename: string; blob: Blob }>

/** Browser edge: the `#toast` node, the download anchor and `location.reload`. */
function stubBrowser(namespace = '') {
  toast = {
    textContent: '',
    dataset: {} as Record<string, string>,
    hasAttribute: () => false,
  } as never
  reload = vi.fn()
  downloads = []
  vi.stubGlobal('document', {
    getElementById: (id: string) => (id === 'toast' ? toast : null),
    addEventListener: () => {},
    removeEventListener: () => {},
    createElement: () => {
      const anchor = {
        href: '',
        download: '',
        click: () => downloads.push({ filename: anchor.download, blob: lastBlob! }),
      }
      return anchor
    },
  })
  vi.stubGlobal('window', {
    location: { reload },
    __FINANCE_NAMESPACE__: namespace,
    addEventListener: () => {},
    removeEventListener: () => {},
  })
  let lastBlob: Blob | undefined
  vi.spyOn(URL, 'createObjectURL').mockImplementation((blob) => {
    lastBlob = blob as Blob
    return 'blob:x'
  })
  vi.spyOn(URL, 'revokeObjectURL').mockImplementation(() => {})
}

beforeEach(() => {
  userCounter += 1
  fetched = []
  syncResponse = () => json({ results: [], revision: 0, halted: false })
  importResponse = () => json({ ok: true, skipped: {} })
  exportResponse = () => json(EXPORT)
  vi.stubGlobal('navigator', { onLine: true })
  vi.stubGlobal(
    'fetch',
    vi.fn(async (url: string, init?: RequestInit) => {
      fetched.push({ url, method: init?.method ?? 'GET', body: init?.body as string | undefined })
      if (url === '/api/bootstrap') return json(EMPTY_BOOTSTRAP)
      if (url.startsWith('/api/changes')) return json({ revision: 0, changes: [] })
      if (url === '/api/sync') return syncResponse()
      if (url === '/api/data/export') return exportResponse()
      if (url === '/api/data/import?mode=replace') return importResponse()
      throw new Error(`unexpected fetch ${url}`)
    }),
  )
  setActivePinia(createTestPinia())
})

afterEach(async () => {
  await useSyncStore().logout({ discardPending: true })
  vi.useRealTimers()
  vi.unstubAllGlobals()
  vi.unstubAllEnvs()
})

async function signedInStore() {
  stubBrowser()
  const sync = useSyncStore()
  await sync.init(`backup-user-${userCounter}`)
  return { data: useDataStore(), sync }
}

describe('useDataStore — JSON backup on sync v2', () => {
  it('exports the server backup, not the in-memory state', async () => {
    const { data } = await signedInStore()
    useFinancialStateStore().state.year = 1999

    await data.exportJson()

    expect(downloads).toHaveLength(1)
    expect(downloads[0].filename).toMatch(/^finance-tracker-\d{4}-\d{2}-\d{2}\.json$/)
    expect(JSON.parse(await downloads[0].blob.text())).toEqual(EXPORT)
    expect(toast.textContent).toBe('JSON exportado.')
  })

  it('does not download anything when the export fails', async () => {
    exportResponse = () => json({}, 500)
    const { data } = await signedInStore()

    await data.exportJson()

    expect(downloads).toEqual([])
    expect(toast.textContent).toBe('No se pudo exportar: El servidor respondió 500')
  })

  it('restores the file on the server and reloads the page', async () => {
    const { data } = await signedInStore()

    await data.importJson(backupFile)

    expect(fetched.filter((request) => request.url.includes('/api/data/import'))).toEqual([
      { url: '/api/data/import?mode=replace', method: 'POST', body: BACKUP_TEXT },
    ])
    expect(reload).toHaveBeenCalledTimes(1)
  })

  it('sends the queued commands before the restore replaces the data', async () => {
    syncResponse = () => json({ error: 'caído' }, 500)
    const { data, sync } = await signedInStore()
    await sync.enqueueCommand({ action: 'noop', commandId: 'queued' })
    await vi.waitFor(() => expect(sync.syncStatus).not.toBe('syncing'))
    expect(sync.pendingCount).toBe(1)
    syncResponse = () =>
      json({ results: [{ commandId: 'queued', status: 'applied' }], revision: 0, halted: false })

    await data.importJson(backupFile)

    const sequence = fetched
      .map((request) => request.url)
      .filter((url) => url === '/api/sync' || url.startsWith('/api/data/import'))
    expect(sequence.at(-2)).toBe('/api/sync')
    expect(sequence.at(-1)).toBe('/api/data/import?mode=replace')
    expect(reload).toHaveBeenCalledTimes(1)
  })

  it('refuses to restore while commands are still queued', async () => {
    syncResponse = () => json({ error: 'caído' }, 500)
    const { data, sync } = await signedInStore()
    await sync.enqueueCommand({ action: 'noop', commandId: 'stuck' })
    await vi.waitFor(() => expect(sync.pendingCount).toBe(1))

    await data.importJson(backupFile)

    expect(fetched.some((request) => request.url.includes('/api/data/import'))).toBe(false)
    expect(reload).not.toHaveBeenCalled()
    expect(toast.textContent).toBe('Hay cambios sin sincronizar. Conéctate y vuelve a intentarlo.')
  })

  it('does not reload when the server rejects the file', async () => {
    importResponse = () => json({ ok: false, error: 'no' }, 400)
    const { data } = await signedInStore()

    await data.importJson(backupFile)

    expect(reload).not.toHaveBeenCalled()
    expect(toast.textContent).toBe('No se pudo importar: no')
  })

  it('keeps the local backup path in demo mode', async () => {
    stubBrowser('demo')
    const state = useFinancialStateStore().state
    const data = useDataStore()

    await data.exportJson()

    expect(fetched.some((request) => request.url === '/api/data/export')).toBe(false)
    expect(downloads).toHaveLength(1)
    expect(downloads[0].filename).toBe(`finance-tracker-${state.year}.json`)
    expect(JSON.parse(await downloads[0].blob.text())).toMatchObject({ year: state.year })
  })
})

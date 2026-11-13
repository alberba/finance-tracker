import { Effect } from 'effect'
import { createPinia, setActivePinia } from 'pinia'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'

vi.mock('../../src/lib/client/data-backup', () => ({
  fetchBackup: vi.fn(),
  restoreBackup: vi.fn(),
}))

const syncStore = { flush: vi.fn(), pendingCount: 0 }
vi.mock('../../src/stores/sync', () => ({ useSyncStore: () => syncStore }))
vi.mock('../../src/scripts/demo-mode', () => ({ isDemoMode: vi.fn(() => false) }))

import { fetchBackup, restoreBackup } from '../../src/lib/client/data-backup'
import { isDemoMode } from '../../src/scripts/demo-mode'
import { useDataStore } from '../../src/stores/data'

/** Same minimal DOM as `data-store-start-fresh.test.ts`, plus the download anchor. */
function stubDom() {
  const reload = vi.fn()
  const click = vi.fn()
  vi.stubGlobal('document', {
    getElementById: () => null,
    createElement: () => ({ click }),
  })
  vi.stubGlobal('window', { location: { reload } })
  vi.stubGlobal('URL', { createObjectURL: () => 'blob:x', revokeObjectURL: vi.fn() })
  return { reload, click }
}

const backupFile = { text: async () => '{"format":"finance-tracker/v2-export"}' } as File

describe('useDataStore — JSON backup on sync v2', () => {
  beforeEach(() => {
    setActivePinia(createPinia())
    vi.mocked(fetchBackup).mockReset()
    vi.mocked(restoreBackup).mockReset()
    syncStore.flush.mockReset()
    syncStore.pendingCount = 0
    vi.mocked(isDemoMode).mockReturnValue(false)
  })

  afterEach(() => {
    vi.unstubAllEnvs()
    vi.unstubAllGlobals()
    vi.mocked(isDemoMode).mockReturnValue(false)
  })

  it('exports the server backup, not the in-memory state', async () => {
    vi.mocked(fetchBackup).mockReturnValue(Effect.succeed({ ok: true, value: '{}' }))
    const { click } = stubDom()

    await useDataStore().exportJson()

    expect(fetchBackup).toHaveBeenCalledTimes(1)
    expect(click).toHaveBeenCalledTimes(1)
  })

  it('does not download anything when the export fails', async () => {
    vi.mocked(fetchBackup).mockReturnValue(Effect.succeed({ ok: false, error: '500' }))
    const { click } = stubDom()

    await useDataStore().exportJson()

    expect(click).not.toHaveBeenCalled()
  })

  it('restores the file on the server after flushing the queue, then reloads', async () => {
    vi.mocked(restoreBackup).mockReturnValue(Effect.succeed({ ok: true, value: { skipped: 0 } }))
    const { reload } = stubDom()

    await useDataStore().importJson(backupFile)

    expect(syncStore.flush).toHaveBeenCalledTimes(1)
    expect(restoreBackup).toHaveBeenCalledWith('{"format":"finance-tracker/v2-export"}')
    expect(reload).toHaveBeenCalledTimes(1)
  })

  it('refuses to restore while commands are still queued', async () => {
    syncStore.pendingCount = 2
    const { reload } = stubDom()

    await useDataStore().importJson(backupFile)

    expect(restoreBackup).not.toHaveBeenCalled()
    expect(reload).not.toHaveBeenCalled()
  })

  it('does not reload when the server rejects the file', async () => {
    vi.mocked(restoreBackup).mockReturnValue(Effect.succeed({ ok: false, error: 'no' }))
    const { reload } = stubDom()

    await useDataStore().importJson(backupFile)

    expect(reload).not.toHaveBeenCalled()
  })

  it('keeps the local backup path in demo mode', async () => {
    vi.mocked(isDemoMode).mockReturnValue(true)
    const { click } = stubDom()

    await useDataStore().exportJson()

    expect(fetchBackup).not.toHaveBeenCalled()
    expect(click).toHaveBeenCalledTimes(1)
  })
})

import 'fake-indexeddb/auto'
import { setActivePinia } from 'pinia'
import { createTestPinia } from '../helpers/pinia'
import { beforeEach, describe, expect, it, vi } from 'vitest'

const runtimes: Array<{ dispose: ReturnType<typeof vi.fn> }> = []

vi.mock('../../src/lib/client/runtime', () => ({
  createClientRuntime: vi.fn(async () => {
    await new Promise((resolve) => setTimeout(resolve, 5))
    const runtime = {
      run: vi.fn(async () => {
        throw new Error('stop after the runtime exists')
      }),
      dispose: vi.fn(async () => {}),
    }
    runtimes.push(runtime)
    return runtime
  }),
}))

import { createClientRuntime } from '../../src/lib/client/runtime'
import { useSyncStore } from '../../src/stores/sync'

describe('useSyncStore.init — llamadas simultáneas', () => {
  beforeEach(() => {
    runtimes.length = 0
    vi.mocked(createClientRuntime).mockClear()
    setActivePinia(createTestPinia())
  })

  it('el shell y el workspace comparten una sola inicialización (un único runtime abierto)', async () => {
    const store = useSyncStore()
    const results = await Promise.allSettled([store.init('user-1'), store.init('user-1')])

    // A second runtime would keep its IndexedDB connections open and block the
    // wipe on logout («Otra pestaña mantiene abierta la caché»).
    expect(createClientRuntime).toHaveBeenCalledTimes(1)
    expect(results.map((result) => result.status)).toEqual(['rejected', 'rejected'])
  })
})

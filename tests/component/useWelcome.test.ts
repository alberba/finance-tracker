import 'fake-indexeddb/auto'
import { mount } from '@vue/test-utils'
import { createPinia, setActivePinia } from 'pinia'
import { defineComponent, nextTick } from 'vue'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { useWelcome } from '../../src/composables/useWelcome'
import { useFinancialStateStore } from '../../src/stores/financial-state'
import { useSyncStore } from '../../src/stores/sync'
import { listAll, openStorage } from '../helpers/client-storage'

const USER_ID = 'user-use-welcome'

/**
 * Host mínimo del composable: pinta su estado en `data-*` y expone `dismiss` y `resume`
 * como botones, así el test lee el DOM y pulsa en vez de tocar `wrapper.vm`.
 */
const Host = defineComponent({
  setup: useWelcome,
  template: `<div :data-open="String(open)" :data-can-resume="String(canResume)" :data-complete="String(complete)">
    <button type="button" data-dismiss @click="dismiss()">dismiss</button>
    <button type="button" data-resume @click="resume()">resume</button>
  </div>`,
})

type HostWrapper = ReturnType<typeof mount>
const isOpen = (wrapper: HostWrapper) => wrapper.attributes('data-open') === 'true'
const canResume = (wrapper: HostWrapper) => wrapper.attributes('data-can-resume') === 'true'
const isComplete = (wrapper: HostWrapper) => wrapper.attributes('data-complete') === 'true'
const dismiss = (wrapper: HostWrapper) => wrapper.get('[data-dismiss]').trigger('click')
const resume = (wrapper: HostWrapper) => wrapper.get('[data-resume]').trigger('click')

let syncStore: ReturnType<typeof useSyncStore>

/** What the user's settings sync has queued on this device: the real outbox, offline. */
async function queuedSettingsPatches(): Promise<Array<Record<string, unknown>>> {
  const storage = await openStorage(USER_ID)
  try {
    return (await listAll(storage)).flatMap((entry) =>
      entry.command.action === 'settingsUpdate'
        ? [entry.command.patch as Record<string, unknown>]
        : [],
    )
  } finally {
    storage.close()
  }
}

beforeEach(async () => {
  // The network is the boundary: this device is offline, so settings only queue.
  vi.stubGlobal(
    'fetch',
    vi.fn(async () => {
      throw new TypeError('Failed to fetch')
    }),
  )
  setActivePinia(createPinia())
  syncStore = useSyncStore()
  await syncStore.init(USER_ID)
  syncStore.connection = 'offline'
  document.documentElement.dataset.financeReady = 'true'
  useFinancialStateStore().commitState((draft) => {
    draft.accounts = []
    draft.transactions = []
    draft.onboardingPresented = false
    draft.onboardingDismissed = false
    draft.onboardingCompleted = false
    draft.onboardingAccountCompleted = false
    draft.onboardingMovementCompleted = false
  })
})

afterEach(async () => {
  await syncStore.logout({ discardPending: true })
  vi.unstubAllGlobals()
})

describe('useWelcome', () => {
  it('does not record a first presentation when bootstrap failed', async () => {
    const store = useFinancialStateStore()
    store.failLoad('No se pudo cargar')
    const wrapper = mount(Host)
    await nextTick()
    expect(isOpen(wrapper)).toBe(false)
    expect(store.state.onboardingPresented).toBe(false)
    store.replaceState(store.state)
    await nextTick()
    expect(isOpen(wrapper)).toBe(true)
    wrapper.unmount()
  })

  it('waits for bootstrap before presenting the welcome', async () => {
    document.documentElement.dataset.financeReady = 'false'
    const wrapper = mount(Host)
    expect(isOpen(wrapper)).toBe(false)
    document.documentElement.dataset.financeReady = 'true'
    await vi.waitFor(() => expect(isOpen(wrapper)).toBe(true))
    wrapper.unmount()
  })

  it('remembers a dismissal and allows resuming without auto reopening', async () => {
    const wrapper = mount(Host)
    await nextTick()
    await dismiss(wrapper)
    await nextTick()
    expect(useFinancialStateStore().state.onboardingDismissed).toBe(true)
    wrapper.unmount()
    const returning = mount(Host)
    await nextTick()
    expect(isOpen(returning)).toBe(false)
    expect(canResume(returning)).toBe(true)
    await resume(returning)
    expect(isOpen(returning)).toBe(true)
    returning.unmount()
  })

  it('closes an automatic presentation when a saved dismissal arrives', async () => {
    const wrapper = mount(Host)
    await nextTick()
    useFinancialStateStore().commitState((draft) => {
      draft.onboardingPresented = true
      draft.onboardingDismissed = true
    })
    await nextTick()
    expect(isOpen(wrapper)).toBe(false)
    await resume(wrapper)
    useFinancialStateStore().commitState((draft) => {
      draft.currency = 'USD'
    })
    await nextTick()
    expect(isOpen(wrapper)).toBe(true)
    wrapper.unmount()
  })

  it('persists presentation together with dismissal before an earlier sync finishes', async () => {
    const wrapper = mount(Host)
    await nextTick()
    await dismiss(wrapper)
    await vi.waitFor(async () => {
      const patches = await queuedSettingsPatches()
      expect(patches.at(-1)).toEqual({ onboardingPresented: true, onboardingDismissed: true })
    })
    wrapper.unmount()
  })

  it('shows completed existing milestones until acknowledged', async () => {
    const store = useFinancialStateStore()
    store.commitState((draft) => {
      draft.accounts = [{ id: 'bank', name: 'Banco', openingBalance: 0 }]
      draft.transactions = [
        {
          id: 'salary',
          type: 'income',
          amount: 10,
          category: 'Nómina',
          accountId: 'bank',
          date: '2026-01-01',
          month: 1,
          description: '',
        },
      ]
    })
    const wrapper = mount(Host)
    await nextTick()
    expect(isOpen(wrapper)).toBe(true)
    expect(isComplete(wrapper)).toBe(true)
    expect(store.state.onboardingCompleted).toBe(false)
    await dismiss(wrapper)
    expect(store.state.onboardingCompleted).toBe(true)
    wrapper.unmount()
  })

  it('recognizes imported milestones and never reopens after data deletion', async () => {
    const store = useFinancialStateStore()
    const wrapper = mount(Host)
    await nextTick()
    store.commitState((draft) => {
      draft.accounts = [{ id: 'bank', name: 'Banco', openingBalance: 0 }]
      draft.transactions = [
        {
          id: 'salary',
          type: 'income',
          amount: 10,
          category: 'Nómina',
          accountId: 'bank',
          date: '2026-01-01',
          month: 1,
          description: '',
        },
      ]
    })
    await nextTick()
    expect(store.state.onboardingCompleted).toBe(true)
    store.commitState((draft) => {
      draft.accounts = []
      draft.transactions = []
    })
    await nextTick()
    expect(canResume(wrapper)).toBe(false)
    expect(isOpen(wrapper)).toBe(false)
    wrapper.unmount()
  })
})

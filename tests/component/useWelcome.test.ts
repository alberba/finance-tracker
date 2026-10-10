import { mount } from '@vue/test-utils'
import { createPinia, setActivePinia } from 'pinia'
import { defineComponent, nextTick } from 'vue'
import { beforeEach, describe, expect, it, vi } from 'vitest'
import { syncSettingsUpdate } from '../../src/lib/client/command-mapping'
import { useWelcome } from '../../src/composables/useWelcome'
import { useFinancialStateStore } from '../../src/stores/financial-state'

vi.mock('../../src/lib/client/command-mapping', () => ({
  syncSettingsUpdate: vi.fn().mockResolvedValue(undefined),
}))
const Host = defineComponent({ setup: useWelcome, template: '<div />' })

beforeEach(() => {
  setActivePinia(createPinia())
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

describe('useWelcome', () => {
  it('does not record a first presentation when bootstrap failed', async () => {
    const store = useFinancialStateStore()
    store.failLoad('No se pudo cargar')
    const wrapper = mount(Host)
    await nextTick()
    expect(wrapper.vm.open).toBe(false)
    expect(store.state.onboardingPresented).toBe(false)
    store.replaceState(store.state)
    await nextTick()
    expect(wrapper.vm.open).toBe(true)
    wrapper.unmount()
  })

  it('waits for bootstrap before presenting the welcome', async () => {
    document.documentElement.dataset.financeReady = 'false'
    const wrapper = mount(Host)
    expect(wrapper.vm.open).toBe(false)
    document.documentElement.dataset.financeReady = 'true'
    await vi.waitFor(() => expect(wrapper.vm.open).toBe(true))
    wrapper.unmount()
  })

  it('remembers a dismissal and allows resuming without auto reopening', async () => {
    const wrapper = mount(Host)
    await nextTick()
    wrapper.vm.dismiss()
    await nextTick()
    expect(useFinancialStateStore().state.onboardingDismissed).toBe(true)
    wrapper.unmount()
    const returning = mount(Host)
    await nextTick()
    expect(returning.vm.open).toBe(false)
    expect(returning.vm.canResume).toBe(true)
    returning.vm.resume()
    expect(returning.vm.open).toBe(true)
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
    expect(wrapper.vm.open).toBe(false)
    wrapper.vm.resume()
    useFinancialStateStore().commitState((draft) => {
      draft.currency = 'USD'
    })
    await nextTick()
    expect(wrapper.vm.open).toBe(true)
    wrapper.unmount()
  })

  it('persists presentation together with dismissal before an earlier sync finishes', async () => {
    const wrapper = mount(Host)
    await nextTick()
    wrapper.vm.dismiss()
    expect(syncSettingsUpdate).toHaveBeenLastCalledWith({
      onboardingPresented: true,
      onboardingDismissed: true,
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
          month: 0,
          description: '',
        },
      ]
    })
    const wrapper = mount(Host)
    await nextTick()
    expect(wrapper.vm.open).toBe(true)
    expect(wrapper.vm.complete).toBe(true)
    expect(store.state.onboardingCompleted).toBe(false)
    wrapper.vm.dismiss()
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
          month: 0,
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
    expect(wrapper.vm.canResume).toBe(false)
    expect(wrapper.vm.open).toBe(false)
    wrapper.unmount()
  })
})

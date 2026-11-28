import { mount } from '@vue/test-utils'
import { createPinia, setActivePinia } from 'pinia'
import { defineComponent, nextTick } from 'vue'
import { beforeEach, describe, expect, it, vi } from 'vitest'
import { SETUP_LAST_STEP, useSetup, useSetupAutoOpen } from '../../src/composables/useSetup'
import { syncSettingsUpdate } from '../../src/lib/client/command-mapping'
import { useFinancialStateStore } from '../../src/stores/financial-state'
import { useUiStore } from '../../src/stores/ui'

vi.mock('../../src/lib/client/command-mapping', () => ({
  syncSettingsUpdate: vi.fn().mockResolvedValue(undefined),
}))

const Host = defineComponent({
  setup() {
    useSetupAutoOpen()
    return useSetup()
  },
  template: '<div />',
})

function settle(patch: Partial<ReturnType<typeof useFinancialStateStore>['state']>): void {
  useFinancialStateStore().commitState((draft) => Object.assign(draft, patch))
}

beforeEach(() => {
  setActivePinia(createPinia())
  vi.mocked(syncSettingsUpdate).mockClear()
  document.documentElement.dataset.financeReady = 'true'
  settle({
    onboardingPresented: false,
    onboardingDismissed: false,
    onboardingCompleted: false,
    onboardingStep: 0,
  })
})

describe('useSetup', () => {
  it('opens on the first visit, once the data is ready, and records it', async () => {
    document.documentElement.dataset.financeReady = 'false'
    const wrapper = mount(Host)
    expect(useUiStore().setupOpen).toBe(false)
    document.documentElement.dataset.financeReady = 'true'
    await vi.waitFor(() => expect(useUiStore().setupOpen).toBe(true))
    expect(useFinancialStateStore().state.onboardingPresented).toBe(true)
    expect(syncSettingsUpdate).toHaveBeenCalledWith({ onboardingPresented: true })
    wrapper.unmount()
  })

  it('stays closed for someone already set up', async () => {
    settle({ onboardingPresented: true, onboardingCompleted: true })
    const wrapper = mount(Host)
    await nextTick()
    expect(useUiStore().setupOpen).toBe(false)
    expect(wrapper.vm.canResume).toBe(false)
    wrapper.unmount()
  })

  it('«Ahora no» closes it and leaves it to resume on the same step', async () => {
    const wrapper = mount(Host)
    await nextTick()
    await wrapper.vm.go(2)
    wrapper.vm.dismiss()
    expect(useUiStore().setupOpen).toBe(false)
    expect(useFinancialStateStore().state).toMatchObject({
      onboardingDismissed: true,
      onboardingStep: 2,
    })
    wrapper.unmount()

    const returning = mount(Host)
    await nextTick()
    expect(useUiStore().setupOpen).toBe(false)
    expect(returning.vm.canResume).toBe(true)
    returning.vm.resume()
    expect(useUiStore().setupOpen).toBe(true)
    expect(returning.vm.step).toBe(2)
    returning.unmount()
  })

  it('opens again on «Listo» after a restored backup reloads the page', async () => {
    settle({ onboardingPresented: true, onboardingStep: SETUP_LAST_STEP })
    const wrapper = mount(Host)
    await nextTick()
    expect(useUiStore().setupOpen).toBe(true)
    wrapper.vm.finish()
    expect(useUiStore().setupOpen).toBe(false)
    expect(useFinancialStateStore().state.onboardingCompleted).toBe(true)
    wrapper.unmount()
  })

  it('reopens from the start for someone who already finished it', async () => {
    settle({ onboardingPresented: true, onboardingCompleted: true, onboardingStep: 6 })
    const wrapper = mount(Host)
    await nextTick()
    wrapper.vm.reopen()
    expect(useUiStore().setupOpen).toBe(true)
    expect(wrapper.vm.step).toBe(1)
    wrapper.unmount()
  })
})

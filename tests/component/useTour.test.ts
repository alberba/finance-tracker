import { mount } from '@vue/test-utils'
import { createPinia, setActivePinia } from 'pinia'
import { defineComponent, nextTick } from 'vue'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { useSetupAutoOpen } from '../../src/composables/useSetup'
import { syncSettingsUpdate } from '../../src/lib/client/command-mapping'
import { useTour, useTourAutoOpen } from '../../src/neon/onboarding/use-tour'
import { useFinancialStateStore } from '../../src/stores/financial-state'
import { useUiStore } from '../../src/stores/ui'

vi.mock('../../src/lib/client/command-mapping', () => ({
  syncSettingsUpdate: vi.fn().mockResolvedValue(undefined),
}))

let desktop = true

const Host = defineComponent({
  setup() {
    useSetupAutoOpen()
    useTourAutoOpen()
    return useTour()
  },
  template: '<div />',
})

function settle(patch: Partial<ReturnType<typeof useFinancialStateStore>['state']>): void {
  useFinancialStateStore().commitState((draft) => Object.assign(draft, patch))
}

beforeEach(() => {
  setActivePinia(createPinia())
  vi.mocked(syncSettingsUpdate).mockClear()
  desktop = true
  vi.stubGlobal('matchMedia', (media: string) => ({
    media,
    matches: desktop,
    addEventListener: () => undefined,
    removeEventListener: () => undefined,
  }))
  window.localStorage.clear()
  document.documentElement.dataset.financeReady = 'true'
  settle({
    onboardingPresented: true,
    onboardingCompleted: true,
    tourDesktopSeen: false,
    tourMobileSeen: false,
  })
})

afterEach(() => {
  vi.unstubAllGlobals()
  window.__FINANCE_NAMESPACE__ = undefined
})

describe('useTour', () => {
  it('starts straight away for someone already set up', async () => {
    const wrapper = mount(Host)
    await nextTick()
    expect(useUiStore().tourOpen).toBe(true)
    wrapper.unmount()
  })

  it('waits for the setup wizard and starts once it is closed', async () => {
    settle({ onboardingPresented: false, onboardingCompleted: false })
    const wrapper = mount(Host)
    await nextTick()
    const ui = useUiStore()
    expect(ui.setupOpen).toBe(true)
    expect(ui.tourOpen).toBe(false)
    ui.setupOpen = false
    await nextTick()
    expect(ui.tourOpen).toBe(true)
    wrapper.unmount()
  })

  it('finishing marks only the current frame, and it does not come back there', async () => {
    const wrapper = mount(Host)
    await nextTick()
    wrapper.vm.finish()
    expect(useUiStore().tourOpen).toBe(false)
    expect(useFinancialStateStore().state).toMatchObject({
      tourDesktopSeen: true,
      tourMobileSeen: false,
    })
    expect(syncSettingsUpdate).toHaveBeenCalledWith({ tourDesktopSeen: true })
    // A refresh from the server before the flag is queued projects it unset.
    settle({ tourDesktopSeen: false })
    await nextTick()
    expect(useUiStore().tourOpen).toBe(false)
    wrapper.unmount()
  })

  it('shows the mobile one to someone who only saw the desktop one', async () => {
    settle({ tourDesktopSeen: true })
    desktop = false
    const wrapper = mount(Host)
    await nextTick()
    expect(wrapper.vm.platform).toBe('mobile')
    expect(useUiStore().tourOpen).toBe(true)
    wrapper.unmount()
  })

  it('closing it half way does not count as seen', async () => {
    const wrapper = mount(Host)
    await nextTick()
    wrapper.vm.abandon()
    expect(useFinancialStateStore().state.tourDesktopSeen).toBe(false)
    expect(syncSettingsUpdate).not.toHaveBeenCalled()
    wrapper.unmount()
  })

  it('in the demo remembers it in the browser and writes nothing', async () => {
    window.__FINANCE_NAMESPACE__ = 'demo'
    const wrapper = mount(Host)
    await nextTick()
    expect(useUiStore().tourOpen).toBe(true)
    wrapper.vm.finish()
    expect(window.localStorage.getItem('finance-tour-desktop-seen')).toBe('1')
    expect(syncSettingsUpdate).not.toHaveBeenCalled()
    wrapper.unmount()

    setActivePinia(createPinia())
    const again = mount(Host)
    await nextTick()
    expect(useUiStore().tourOpen).toBe(false)
    again.unmount()
  })
})

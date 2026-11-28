import { createPinia, setActivePinia } from 'pinia'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { useDataStore } from '../../src/stores/data'
import { useFinancialStateStore } from '../../src/stores/financial-state'

beforeEach(() => {
  setActivePinia(createPinia())
  window.__FINANCE_NAMESPACE__ = 'demo'
})
afterEach(() => {
  window.__FINANCE_NAMESPACE__ = undefined
})

describe('demo import preserves the recipient setup progress', () => {
  it.each([false, true])('keeps completion %s when replacing financial data', async (completed) => {
    const store = useFinancialStateStore()
    store.commitState((draft) => {
      draft.onboardingPresented = true
      draft.onboardingDismissed = true
      draft.onboardingCompleted = completed
      draft.onboardingStep = 4
    })
    const file = new File(
      [JSON.stringify({ currency: 'USD', onboardingCompleted: !completed, onboardingStep: 1 })],
      'backup.json',
    )
    await useDataStore().importJson(file)
    await vi.waitFor(() => expect(store.currency).toBe('USD'))
    expect(store.state).toMatchObject({
      onboardingPresented: true,
      onboardingDismissed: true,
      onboardingCompleted: completed,
      onboardingStep: 4,
    })
  })
})

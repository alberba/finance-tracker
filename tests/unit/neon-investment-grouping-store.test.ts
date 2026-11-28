import { createPinia, setActivePinia } from 'pinia'
import { beforeEach, describe, expect, it, vi } from 'vitest'

import { syncSettingsUpdate } from '../../src/lib/client/command-mapping'
import { useFinancialStateStore } from '../../src/stores/financial-state'

vi.mock('../../src/lib/client/command-mapping', () => ({
  syncSettingsUpdate: vi.fn(async () => {}),
}))

import { useInvestmentGroupingStore } from '../../src/neon/sections/investment/grouping-store'

beforeEach(() => {
  setActivePinia(createPinia())
  vi.clearAllMocks()
})

describe('investment grouping preference', () => {
  it('starts grouped by account', () => {
    expect(useInvestmentGroupingStore().grouping).toBe('account')
  })

  it('keeps the choice in the shared snapshot and syncs it as a setting', () => {
    const financial = useFinancialStateStore()
    const store = useInvestmentGroupingStore()

    store.setGrouping('instrument')

    expect(store.grouping).toBe('instrument')
    expect(financial.state.investmentGrouping).toBe('instrument')
    expect(syncSettingsUpdate).toHaveBeenCalledWith({ investmentGrouping: 'instrument' })
  })

  it('does not sync a choice that is already the current one', () => {
    const store = useInvestmentGroupingStore()
    store.setGrouping('type')
    store.setGrouping('type')

    expect(syncSettingsUpdate).toHaveBeenCalledTimes(1)
  })

  it('follows the snapshot when another device changes it', () => {
    const financial = useFinancialStateStore()
    const store = useInvestmentGroupingStore()

    financial.commitState((draft) => {
      draft.investmentGrouping = 'type'
    })

    expect(store.grouping).toBe('type')
    expect(syncSettingsUpdate).not.toHaveBeenCalled()
  })
})

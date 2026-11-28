import { defineStore } from 'pinia'
import { computed, shallowRef } from 'vue'

import { syncSettingsUpdate } from '../../../lib/client/command-mapping'
import { isReadOnlyDemoActive } from '../../../lib/client/demo-source'
import {
  DEFAULT_INVESTMENT_GROUPING,
  type InvestmentGrouping,
} from '../../../lib/investment-grouping'
import { useFinancialStateStore } from '../../../stores/financial-state'

/**
 * How the cover of Inversión groups its positions (#562): by account, by
 * instrument or by type. Stored as a sync-v2 user preference in the shared
 * financial snapshot, like the home's layout, so it survives a reload and
 * follows the user to another device. The read-only demo keeps it in memory.
 */
export const useInvestmentGroupingStore = defineStore('neon-investment-grouping', () => {
  const financialState = useFinancialStateStore()
  const demo = isReadOnlyDemoActive()
  const demoGrouping = shallowRef<InvestmentGrouping>(DEFAULT_INVESTMENT_GROUPING)
  const grouping = computed(() =>
    demo ? demoGrouping.value : financialState.state.investmentGrouping,
  )

  function setGrouping(next: InvestmentGrouping): void {
    if (next === grouping.value) return
    if (demo) {
      demoGrouping.value = next
      return
    }
    financialState.commitState((draft) => {
      draft.investmentGrouping = next
    })
    void syncSettingsUpdate({ investmentGrouping: next })
  }

  return { grouping, setGrouping }
})

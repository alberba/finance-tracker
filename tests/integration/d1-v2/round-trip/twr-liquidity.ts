import { syncTwrLiquidityAccounts } from '../../../../src/lib/client/command-mapping'
import { useFinancialStateStore } from '../../../../src/stores/financial-state'

/** Marks an account as portfolio liquidity and syncs the whole selection, as the settings do. */
export function setTwrLiquidity(accountId: string, enabled: boolean): void {
  const financialStateStore = useFinancialStateStore()
  financialStateStore.commitState((draft) => {
    const selection = new Set((draft.twrLiquidityAccountIds || []).map(String))
    if (enabled) selection.add(accountId)
    else selection.delete(accountId)
    draft.twrLiquidityAccountIds = Array.from(selection)
  })
  void syncTwrLiquidityAccounts(financialStateStore.state.twrLiquidityAccountIds)
}

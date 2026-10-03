import { computed } from 'vue'

import {
  buildAssetsViewModel,
  summarizeStockEventsSync,
  type AssetRowViewModel,
  type StockEventsSyncSummary,
} from '../domain/settings/view-model'
import { useFinancialStateStore } from '../stores/financial-state'
import { useStockEventsStore, type StockEventsSymbolRow } from '../stores/stockevents'

export interface SettingsAssetRow extends AssetRowViewModel {
  /** Stock Events rows of its symbols. */
  syncRows: StockEventsSymbolRow[]
  sync: StockEventsSyncSummary
}

/**
 * The investment assets of Configuración joined with their Stock Events rows,
 * plus how many need a look: movements to link or a symbol Stock Events
 * cannot sync.
 */
export function useSettingsAssets() {
  const financialStateStore = useFinancialStateStore()
  const stockEventsStore = useStockEventsStore()

  const overview = computed(() => buildAssetsViewModel(financialStateStore.state))

  const assets = computed<SettingsAssetRow[]>(() => {
    const rowsBySymbol = new Map(stockEventsStore.symbolRows.map((row) => [row.symbol, row]))
    return overview.value.assets.map((asset) => {
      const syncRows = asset.symbols.flatMap((symbol) => rowsBySymbol.get(symbol) ?? [])
      return { ...asset, syncRows, sync: summarizeStockEventsSync(syncRows) }
    })
  })

  const orphanRows = computed(() => {
    const orphans = new Set(overview.value.orphanSymbols)
    return stockEventsStore.symbolRows.filter((row) => orphans.has(row.symbol))
  })

  const alerts = computed(
    () => assets.value.filter((asset) => asset.pending > 0 || asset.sync.tone === 'warn').length,
  )

  return { assets, orphanRows, alerts }
}

import type { DiagnosticCode } from '../../../domain/reports/diagnostic'
import { positionValue } from '../../../domain/investment/view-model'
import { movementBelongsToInvestmentAsset } from '../../../lib/finance-core'
import { ALL_MONTHS, type Month } from '../../../lib/month'
import type { State } from '../../../scripts/types'

export function diagnosePositions(
  state: State,
  month: Month,
  visibleIds: readonly string[],
  selectedId?: string | null,
): DiagnosticCode[] {
  const selected = selectedId
    ? state.investmentAssets.filter((asset) => asset.id === selectedId)
    : state.investmentAssets
  const visible = selected.filter((asset) => visibleIds.includes(asset.id))
  const checks: DiagnosticCode[] = [visible.length ? 'position-visible' : 'position-empty']
  const later = ALL_MONTHS.filter((candidate) => candidate > month)
  const moves = state.transactions.filter((tx) => tx.type === 'investment')

  const attribution = new Set<DiagnosticCode>()
  const instruments = new Set(state.instruments.map((instrument) => instrument.id))
  for (const asset of visible) {
    const accounts = new Set<string>()
    for (const tx of moves) {
      if (
        tx.month > month ||
        !movementBelongsToInvestmentAsset(tx, asset, state.investmentAssets, state.instruments)
      )
        continue
      if (tx.accountId) accounts.add(tx.accountId)
      attribution.add(
        tx.instrumentId && instruments.has(tx.instrumentId)
          ? 'position-instrument'
          : 'position-category',
      )
    }
    if (!accounts.size) attribution.add('insufficient')
    if (accounts.size > 1) attribution.add('position-grouped')
  }
  checks.push(...attribution)

  if (
    selected.some(
      (asset) =>
        !visibleIds.includes(asset.id) &&
        later.some((period) => positionValue(state, asset, period) > 0),
    )
  )
    checks.push('position-outside-period')

  if (checks.length === 1 && visible.length === 0) checks.push('insufficient')
  return checks
}

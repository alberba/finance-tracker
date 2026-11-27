import { asMonth } from '../../lib/month'
import {
  deriveContributionFlow,
  findLiquidityTargets,
  toSnapshotDate,
} from '../../scripts/contribution-workflow'
import type { Contribution, SnapshotRow, State } from '../../scripts/types'
import { parseFloatSafe, parseIntSafe, round2 } from '../../scripts/utils'

function getInvestmentValueFromSnapshot(snapshot: SnapshotRow | undefined): number {
  return round2(
    Object.values(snapshot?.investments || {}).reduce(
      (sum, value) => sum + parseFloatSafe(value, 0),
      0,
    ),
  )
}

function getPortfolioValueFromSnapshot(
  snapshot: SnapshotRow | undefined,
  liquidityAccountIds: Set<string>,
): number {
  const investmentValue = getInvestmentValueFromSnapshot(snapshot)
  const liquidityValue = round2(
    Object.entries(snapshot?.accounts || {}).reduce((sum: number, [accountId, value]) => {
      if (!liquidityAccountIds.has(String(accountId))) {
        return sum
      }
      return sum + parseFloatSafe(value, 0)
    }, 0),
  )
  return round2(investmentValue + liquidityValue)
}

export function getContributionEntriesFromSnapshots(state: State): Contribution[] {
  const liquidityTargetIds = new Set(
    findLiquidityTargets(state.accounts, state.twrLiquidityAccountIds).matched.map((account) =>
      String(account.id),
    ),
  )
  const rowsByDate = new Map<string, Contribution>()

  Object.entries(state.snapshots || {}).forEach(([monthKey, snapshot]) => {
    const month = asMonth(parseIntSafe(monthKey, 0))
    if (!month) {
      return
    }
    const date = toSnapshotDate(state.year, month)
    const existing = state.contributions.find(
      (item) => String(item.portfolioDate || item.date) === date,
    )
    // A saved contribution stores the portfolio value **before** the flow.
    // The snapshot itself is already post-flow, so prefer the saved value:
    // using the snapshot total and adding the flow again double-counts it and
    // turns a flat month into a fake loss.
    const savedPortfolioValue = existing
      ? round2(parseFloatSafe(existing.portfolioValue, 0))
      : 0
    const portfolioValue =
      savedPortfolioValue > 0
        ? savedPortfolioValue
        : getPortfolioValueFromSnapshot(snapshot, liquidityTargetIds)
    if (portfolioValue <= 0) {
      return
    }
    const derived = deriveContributionFlow(existing || {})
    const flow = round2(derived.flow)
    const row: Contribution = {
      id: existing?.id || `contrib-snapshot-${state.year}-${month}`,
      date,
      amount: round2(parseFloatSafe(existing?.amount, flow)),
      portfolioDate: date,
      portfolioValue,
      flow,
      flowAllocations: derived.allocations,
      flowSource: derived.flowSource,
      warnings: Array.isArray(existing?.warnings)
        ? existing.warnings.map((entry: unknown) => String(entry || '').trim()).filter(Boolean)
        : [],
    }
    rowsByDate.set(date, row)
  })

  state.contributions.forEach((item) => {
    const date = String(item.portfolioDate || item.date || '').trim()
    if (!date) {
      return
    }
    const derived = deriveContributionFlow(item || {})
    const existing = rowsByDate.get(date)
    const keepsSnapshotPortfolioValue = Boolean(existing)
    const normalizedPortfolioValue = round2(
      parseFloatSafe(
        item.portfolioValue,
        keepsSnapshotPortfolioValue ? (existing?.portfolioValue ?? 0) : 0,
      ),
    )
    const portfolioValue =
      keepsSnapshotPortfolioValue && existing
        ? round2(parseFloatSafe(existing.portfolioValue, 0))
        : normalizedPortfolioValue > 0
          ? normalizedPortfolioValue
          : round2(parseFloatSafe(existing?.portfolioValue, 0))
    if (portfolioValue <= 0) {
      return
    }
    rowsByDate.set(date, {
      id: String(item.id || existing?.id || `contrib-${date}`),
      date,
      amount: round2(parseFloatSafe(item.amount, derived.flow)),
      portfolioDate: date,
      portfolioValue,
      flow: round2(derived.flow),
      flowAllocations: derived.allocations,
      flowSource: derived.flowSource,
      warnings: Array.isArray(item?.warnings)
        ? item.warnings.map((entry: unknown) => String(entry || '').trim()).filter(Boolean)
        : [],
    })
  })

  return Array.from(rowsByDate.values()).sort((a, b) =>
    String(a.portfolioDate || a.date).localeCompare(String(b.portfolioDate || b.date)),
  )
}

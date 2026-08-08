import {
  computeContributionMetrics as computeContributionMetricsCore,
  type ContributionEntry,
} from '../../lib/finance-core'
import {
  deriveContributionFlow,
  findLiquidityTargets,
  getFlowFromAllocations,
  sanitizeFlowAllocations,
  toSnapshotDate,
  type ContributionFlowAllocation,
} from '../../scripts/contribution-workflow'
import type {
  Contribution,
  ContributionMetricRow,
  Entity,
  SnapshotKind,
  SnapshotRow,
  State,
} from '../../scripts/types'
import { clone, monthFromISO, parseFloatSafe, parseIntSafe, round2 } from '../../scripts/utils'

export interface SnapshotInputValue {
  kind: SnapshotKind
  id: string
  value: string
}

export interface AllocationInputValue {
  accountId: string
  amount: number
}

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

export function isAutomaticContributionDate(state: State, date: string): boolean {
  const month = monthFromISO(date)
  if (month === null) {
    return false
  }
  return date === toSnapshotDate(state.year, month)
}

export function isManualContributionDate(state: State, date: string): boolean {
  return !isAutomaticContributionDate(state, date)
}

export function getContributionEntriesFromSnapshots(state: State): Contribution[] {
  const liquidityTargetIds = new Set(
    findLiquidityTargets(state.accounts, state.twrLiquidityAccountIds).matched.map((account) =>
      String(account.id),
    ),
  )
  const rowsByDate = new Map<string, Contribution>()

  Object.entries(state.snapshots || {}).forEach(([monthKey, snapshot]) => {
    const month = parseIntSafe(monthKey, -1)
    if (!Number.isInteger(month) || month < 0 || month > 11) {
      return
    }
    const portfolioValue = getPortfolioValueFromSnapshot(snapshot, liquidityTargetIds)
    if (portfolioValue <= 0) {
      return
    }
    const date = toSnapshotDate(state.year, month)
    const existing = state.contributions.find(
      (item) => String(item.portfolioDate || item.date) === date,
    )
    const derived = deriveContributionFlow(existing || {})
    const flow = round2(derived.flow)
    const row: Contribution = {
      id: existing?.id || `contrib-snapshot-${state.year}-${month + 1}`,
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
      parseFloatSafe(item.portfolioValue, keepsSnapshotPortfolioValue ? (existing?.portfolioValue ?? 0) : 0),
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

export function buildContributionMetricRows(state: State): ContributionMetricRow[] {
  return computeContributionMetricsCore(
    getContributionEntriesFromSnapshots(state) as ContributionEntry[],
  ) as ContributionMetricRow[]
}

export interface WorkflowSnapshotState {
  investments: Array<{ id: string; name: string; value: string }>
  liquidity: Array<{ id: string; name: string; value: string }>
  missingLiquidity: string[]
  allocations: Array<{ accountId: string; name: string; amount: string }>
}

export function buildWorkflowSnapshotState(
  state: State,
  month: number,
  date: string,
): WorkflowSnapshotState {
  const { matched: liquidityAccounts, missing } = findLiquidityTargets(
    state.accounts,
    state.twrLiquidityAccountIds,
  )
  const snapshot = state.snapshots[String(month)]
  const existing = state.contributions.find(
    (item) => String(item.portfolioDate || item.date) === date,
  )
  const existingAllocations = sanitizeFlowAllocations(existing?.flowAllocations || [])
  const allocationsByAccountId = new Map(existingAllocations.map((item) => [item.accountId, item.amount]))

  const snapshotValue = (kind: SnapshotKind, id: string): string => {
    const raw = snapshot?.[kind]?.[id]
    return raw === undefined || raw === null ? '' : String(raw)
  }

  return {
    investments: state.investmentAssets.map((asset: Entity) => ({
      id: asset.id,
      name: asset.name,
      value: snapshotValue('investments', asset.id),
    })),
    liquidity: liquidityAccounts.map((account) => ({
      id: account.id,
      name: account.name,
      value: snapshotValue('accounts', account.id),
    })),
    missingLiquidity: missing,
    allocations: liquidityAccounts.map((account) => ({
      accountId: account.id,
      name: account.name,
      amount: String(allocationsByAccountId.get(account.id) ?? 0),
    })),
  }
}

export function computeWorkflowWarnings(
  state: State,
  snapshotInputs: SnapshotInputValue[],
  allocations: AllocationInputValue[],
  total: number,
  formatMoney: (value: number) => string,
): string[] {
  const warnings: string[] = []

  const missingInvestment = snapshotInputs.filter(
    (input) => input.kind === 'investments' && Number.isNaN(parseFloatSafe(input.value, Number.NaN)),
  ).length
  if (missingInvestment > 0) {
    warnings.push(`Faltan snapshots de inversión: ${missingInvestment}`)
  }

  const missingLiquidity = snapshotInputs.filter(
    (input) => input.kind === 'accounts' && Number.isNaN(parseFloatSafe(input.value, Number.NaN)),
  ).length
  if (missingLiquidity > 0) {
    warnings.push(`Faltan snapshots de liquidez: ${missingLiquidity}`)
  }

  const { missing } = findLiquidityTargets(state.accounts, state.twrLiquidityAccountIds)
  if (missing.length > 0) {
    warnings.push(`Cuentas de liquidez no configuradas: ${missing.join(', ')}`)
  }

  const allocated = round2(
    allocations.reduce((sum, item) => {
      const value = round2(item.amount)
      if (value <= 0 || Number.isNaN(value)) {
        return sum
      }
      return sum + value
    }, 0),
  )
  const delta = round2(total - allocated)
  if (delta > 0) {
    warnings.push(`Importe sin asignar: ${formatMoney(delta)}`)
  }
  if (delta < 0) {
    warnings.push(`Importe sobreasignado: ${formatMoney(Math.abs(delta))}`)
  }

  return warnings
}

export interface ContributionSaveInput {
  date: string
  month: number
  snapshotInputs: SnapshotInputValue[]
  allocations: AllocationInputValue[]
  warnings: string[]
}

export interface ContributionSaveResult {
  ok: boolean
  error?: string
  hadWarnings: boolean
  /**
   * The resulting state, present only when `ok`. Never the same reference as
   * the `draft` argument (see purity note on `applyContributionSave`).
   */
  state?: State
}

/**
 * Computes the guided-contribution save onto a state, mirroring the legacy
 * workflow: persist snapshots, derive the closing portfolio value (excluding the
 * contribution flow), fold allocation deltas into the liquidity snapshots and
 * upsert the contribution entry.
 *
 * Pure function: `draft` is never mutated. A deep clone is taken up front and
 * every derived write lands on that clone, which is returned as
 * `result.state` on success. This matters beyond the Pinia store's own
 * `commitState` (which already hands in a disposable clone) — a v2
 * repository (WP6) may call this against a state assembled from D1 rows that
 * must not be mutated as a side effect, per Contradiction #9 in
 * `docs/migration/work-packages.md`.
 */
export function applyContributionSave(
  draft: State,
  input: ContributionSaveInput,
): ContributionSaveResult {
  const month = input.month
  const date = input.date
  const nextState = clone(draft)

  if (!nextState.snapshots[String(month)]) {
    nextState.snapshots[String(month)] = { month, accounts: {}, investments: {}, liabilities: {} }
  }
  const snapshot = nextState.snapshots[String(month)]

  input.snapshotInputs.forEach((item) => {
    const parsed = parseFloatSafe(item.value, Number.NaN)
    if (Number.isNaN(parsed)) {
      delete snapshot[item.kind][item.id]
    } else {
      snapshot[item.kind][item.id] = round2(parsed)
    }
  })

  const flowAllocations = sanitizeFlowAllocations(input.allocations)
  const existingIndex = nextState.contributions.findIndex(
    (item) => String(item.portfolioDate || item.date) === date,
  )
  const previousAllocations =
    existingIndex >= 0
      ? sanitizeFlowAllocations(nextState.contributions[existingIndex].flowAllocations || [])
      : []

  const investmentValue = getInvestmentValueFromSnapshot(snapshot)
  if (investmentValue <= 0) {
    return {
      ok: false,
      error: 'Debes indicar al menos un snapshot de inversión para registrar el aporte.',
      hadWarnings: false,
    }
  }

  const liquidityTargetIds = new Set(
    findLiquidityTargets(nextState.accounts, nextState.twrLiquidityAccountIds).matched.map(
      (account) => String(account.id),
    ),
  )
  const previousFlow = round2(
    previousAllocations.reduce((sum, item) => {
      if (!liquidityTargetIds.has(item.accountId)) {
        return sum
      }
      return sum + item.amount
    }, 0),
  )
  const portfolioValue = round2(
    getPortfolioValueFromSnapshot(snapshot, liquidityTargetIds) - previousFlow,
  )
  if (portfolioValue <= 0) {
    return {
      ok: false,
      error: 'El valor de cartera debe ser mayor que cero para registrar el aporte.',
      hadWarnings: false,
    }
  }

  const previousByAccount = new Map<string, number>(
    previousAllocations.map((item) => [item.accountId, item.amount]),
  )
  flowAllocations.forEach((item: ContributionFlowAllocation) => {
    const previous = previousByAccount.get(item.accountId) ?? 0
    const delta = round2(item.amount - previous)
    if (delta !== 0) {
      const currentValue = round2(parseFloatSafe(snapshot.accounts[item.accountId], 0))
      snapshot.accounts[item.accountId] = round2(currentValue + delta)
    }
    previousByAccount.delete(item.accountId)
  })
  previousByAccount.forEach((amount, accountId) => {
    if (amount === 0) {
      return
    }
    const currentValue = round2(parseFloatSafe(snapshot.accounts[accountId], 0))
    snapshot.accounts[accountId] = round2(currentValue - amount)
  })

  const flow = getFlowFromAllocations(flowAllocations)
  const payload: Contribution = {
    id:
      existingIndex >= 0
        ? nextState.contributions[existingIndex].id
        : `contrib-snapshot-${nextState.year}-${month + 1}`,
    date,
    amount: flow,
    portfolioDate: date,
    portfolioValue,
    flow,
    flowAllocations,
    flowSource: 'allocations',
    warnings: input.warnings,
  }

  if (existingIndex >= 0) {
    nextState.contributions[existingIndex] = payload
  } else {
    nextState.contributions.push(payload)
  }

  return { ok: true, hadWarnings: input.warnings.length > 0, state: nextState }
}

export function upsertContributionFlow(draft: State, date: string, flow: number): void {
  const entries = getContributionEntriesFromSnapshots(draft)
  const current = entries.find((item) => item.date === date || item.portfolioDate === date)
  if (!current) {
    return
  }
  const existingIndex = draft.contributions.findIndex(
    (item) => String(item.portfolioDate || item.date) === date,
  )
  const payload: Contribution = {
    id: current.id,
    date,
    amount: flow,
    portfolioDate: date,
    portfolioValue: current.portfolioValue,
    flow,
    flowAllocations: [],
    flowSource: 'legacy',
    warnings: [],
  }
  if (existingIndex >= 0) {
    draft.contributions[existingIndex] = payload
  } else {
    draft.contributions.push(payload)
  }
}

export function removeManualContribution(draft: State, date: string): void {
  draft.contributions = draft.contributions.filter(
    (item) => String(item.portfolioDate || item.date || '').trim() !== date,
  )
}

import {
  computeAccountBalance,
  computeInvestmentValue,
  computeLiabilityValue,
  getWealthByMonth,
  type Entity,
  type Snapshot,
  type Transaction,
} from '../../lib/finance-core'
import { MONTHS, type SnapshotKind, type State } from '../../scripts/types'

export interface SnapshotRowViewModel {
  id: string
  name: string
  opening: number
  calculated: number
  snapshot: number | null
}

export interface WealthTimelineRow {
  label: string
  liquidity: number
  investment: number
  liabilities: number
  net: number
}

export interface WealthViewModel {
  accountRows: SnapshotRowViewModel[]
  investmentRows: SnapshotRowViewModel[]
  liabilityRows: SnapshotRowViewModel[]
  timeline: WealthTimelineRow[]
  netSeries: number[]
  chartLabels: string[]
}

function round2(value: number): number {
  return Math.round((value || 0) * 100) / 100
}

function getSnapshotValue(state: State, kind: SnapshotKind, month: number, itemId: string): number | null {
  const snapshot = state.snapshots[String(month)]
  if (!snapshot || !snapshot[kind]) {
    return null
  }
  const raw = snapshot[kind][itemId]
  return Number.isFinite(Number(raw)) ? Number(raw) : null
}

function visibleMonthLimit(year: number): number {
  const now = new Date()
  if (year === now.getFullYear()) {
    return Math.min(now.getMonth(), MONTHS.length - 1)
  }
  return MONTHS.length - 1
}

export function buildWealthViewModel(state: State, month: number): WealthViewModel {
  const accounts = state.accounts as Entity[]
  const investmentAssets = state.investmentAssets as Entity[]
  const liabilities = state.liabilities as Entity[]
  const transactions = state.transactions as Transaction[]
  const snapshots = state.snapshots as Record<string, Snapshot>

  const accountRows: SnapshotRowViewModel[] = state.accounts.map((item) => ({
    id: item.id,
    name: item.name,
    opening: round2(item.openingBalance || 0),
    calculated: round2(computeAccountBalance(item.id, month, accounts, transactions, snapshots)),
    snapshot: getSnapshotValue(state, 'accounts', month, item.id),
  }))

  const investmentRows: SnapshotRowViewModel[] = state.investmentAssets.map((item) => ({
    id: item.id,
    name: item.name,
    opening: round2(item.openingBalance || 0),
    calculated: round2(
      computeInvestmentValue(item.id, month, investmentAssets, transactions, snapshots),
    ),
    snapshot: getSnapshotValue(state, 'investments', month, item.id),
  }))

  const liabilityRows: SnapshotRowViewModel[] = state.liabilities.map((item) => ({
    id: item.id,
    name: item.name,
    opening: round2(item.openingBalance || 0),
    calculated: round2(computeLiabilityValue(item.id, month, liabilities, snapshots)),
    snapshot: getSnapshotValue(state, 'liabilities', month, item.id),
  }))

  const limit = visibleMonthLimit(state.year)
  const series = MONTHS.slice(0, limit + 1).map((_, monthIndex) =>
    getWealthByMonth(monthIndex, accounts, investmentAssets, liabilities, transactions, snapshots),
  )

  return {
    accountRows,
    investmentRows,
    liabilityRows,
    timeline: series.map((entry, monthIndex) => ({
      label: MONTHS[monthIndex],
      liquidity: entry.liquidity,
      investment: entry.investment,
      liabilities: entry.liabilities,
      net: entry.net,
    })),
    netSeries: series.map((entry) => entry.net),
    chartLabels: MONTHS.slice(0, limit + 1),
  }
}

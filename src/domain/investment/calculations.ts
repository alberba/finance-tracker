import { asMonth, type Month, type MonthOrStart } from '../../lib/month'
import {
  computeAccountBalance as coreAccountBalance,
  computeInvestmentValue as coreInvestmentValue,
  getWealthByMonth as coreWealthByMonth,
  matchesInvestmentAsset,
  type Entity,
  type Snapshot,
  type Transaction,
  type WealthSnapshot,
} from '../../lib/finance-core'
import { findLiquidityTargets } from '../../scripts/contribution-workflow'
import type { State } from '../../scripts/types'
import { monthFromISO, round2 } from '../../scripts/utils'

export { matchesInvestmentAsset }

function assets(state: State): Entity[] {
  return state.investmentAssets as Entity[]
}
function accounts(state: State): Entity[] {
  return state.accounts as Entity[]
}
function liabilities(state: State): Entity[] {
  return state.liabilities as Entity[]
}
function transactions(state: State): Transaction[] {
  return state.transactions as Transaction[]
}
function snapshots(state: State): Record<string, Snapshot> {
  return state.snapshots as Record<string, Snapshot>
}

export function computeInvestmentValue(state: State, assetId: string, month: MonthOrStart): number {
  return coreInvestmentValue(assetId, month, assets(state), transactions(state), snapshots(state))
}

export function computeAccountBalance(state: State, accountId: string, month: MonthOrStart): number {
  return coreAccountBalance(accountId, month, accounts(state), transactions(state), snapshots(state))
}

export function wealthByMonth(state: State, month: MonthOrStart): WealthSnapshot {
  return coreWealthByMonth(
    month,
    accounts(state),
    assets(state),
    liabilities(state),
    transactions(state),
    snapshots(state),
  )
}

export function isBitvavoBrokerAccount(state: State, accountId: string): boolean {
  const account = state.accounts.find((item) => item.id === accountId)
  return (
    String(account?.name || '')
      .trim()
      .toLowerCase() === 'bitvavo'
  )
}

export function resolveInvestmentCategory(
  state: State,
  accountId: string,
  rawCategory: string,
  fallbackCategory: string,
): string {
  if (isBitvavoBrokerAccount(state, accountId)) {
    return 'Crypto'
  }
  const normalized = String(rawCategory || '').trim()
  if (normalized) {
    return normalized
  }
  return String(fallbackCategory || 'Sin categoría').trim() || 'Sin categoría'
}

export function computeInvestedCapital(state: State, month: Month): number {
  const openingCapital = state.investmentAssets.reduce(
    (sum, item) => sum + Number(item.openingBalance || 0),
    0,
  )
  const contributions = state.transactions
    .filter((item) => item.type === 'investment' && Number(item.month) <= month)
    .reduce((sum, item) => sum + Number(item.amount || 0), 0)
  return round2(openingCapital + contributions)
}

export function computeInvestedCapitalByAsset(state: State, assetId: string, month: MonthOrStart): number {
  const asset = state.investmentAssets.find((item) => item.id === assetId)
  if (!asset) {
    return 0
  }
  const openingCapital = Number(asset.openingBalance || 0)
  const contributions = state.transactions.reduce((sum, item) => {
    if (item.type !== 'investment') return sum
    if (Number(item.month) > month) return sum
    if (!matchesInvestmentAsset(item.category, asset as Entity)) return sum
    return sum + Number(item.amount || 0)
  }, 0)
  return round2(openingCapital + contributions)
}

export function computeTwrLiquidityValue(state: State, month: MonthOrStart): number {
  const matched = findLiquidityTargets(state.accounts, state.twrLiquidityAccountIds).matched
  return round2(
    matched.reduce((sum, account) => sum + computeAccountBalance(state, account.id, month), 0),
  )
}

export function computeInvestmentPortfolioValueForReturnMode(
  state: State,
  month: MonthOrStart,
  mode: 'simple' | 'twr',
): number {
  const wealth = wealthByMonth(state, month)
  if (mode !== 'twr') {
    return round2(wealth.investment)
  }
  return round2(wealth.investment + computeTwrLiquidityValue(state, month))
}

export function getLatestDataMonth(state: State, fallbackMonth: Month): Month {
  let latest: Month | null = null
  const consider = (month: Month | null) => {
    if (month !== null && (latest === null || month > latest)) latest = month
  }
  state.transactions.forEach((item) => consider(asMonth(Number(item.month))))
  Object.keys(state.snapshots || {}).forEach((monthKey) => consider(asMonth(Number(monthKey))))
  state.contributions.forEach((entry) => consider(monthFromISO(entry.portfolioDate || entry.date)))
  return latest ?? fallbackMonth
}

import {
  computeAccountBalance as coreAccountBalance,
  computeInvestmentValue as coreInvestmentValue,
  getWealthByMonth as coreWealthByMonth,
  type Entity,
  type Snapshot,
  type Transaction,
  type WealthSnapshot,
} from '../../lib/finance-core'
import { findLiquidityTargets } from '../../scripts/contribution-workflow'
import { MONTHS, type State } from '../../scripts/types'
import { monthFromISO, round2, slug } from '../../scripts/utils'

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

export function computeInvestmentValue(state: State, assetId: string, month: number): number {
  return coreInvestmentValue(assetId, month, assets(state), transactions(state), snapshots(state))
}

export function computeAccountBalance(state: State, accountId: string, month: number): number {
  return coreAccountBalance(accountId, month, accounts(state), transactions(state), snapshots(state))
}

export function wealthByMonth(state: State, month: number): WealthSnapshot {
  return coreWealthByMonth(
    month,
    accounts(state),
    assets(state),
    liabilities(state),
    transactions(state),
    snapshots(state),
  )
}

export function matchesInvestmentAsset(category: string, asset: Entity): boolean {
  if (!category || !asset) {
    return false
  }
  const catSlug = slug(category)
  return catSlug === asset.id || category.toLowerCase() === String(asset.name || '').toLowerCase()
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

export function computeInvestedCapital(state: State, month: number): number {
  const openingCapital = state.investmentAssets.reduce(
    (sum, item) => sum + Number(item.openingBalance || 0),
    0,
  )
  const contributions = state.transactions
    .filter((item) => item.type === 'investment' && Number(item.month) <= month)
    .reduce((sum, item) => sum + Number(item.amount || 0), 0)
  return round2(openingCapital + contributions)
}

export function computeInvestedCapitalByAsset(state: State, assetId: string, month: number): number {
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

export function computeTwrLiquidityValue(state: State, month: number): number {
  const matched = findLiquidityTargets(state.accounts, state.twrLiquidityAccountIds).matched
  return round2(
    matched.reduce((sum, account) => sum + computeAccountBalance(state, account.id, month), 0),
  )
}

export function computeInvestmentPortfolioValueForReturnMode(
  state: State,
  month: number,
  mode: 'simple' | 'twr',
): number {
  const wealth = wealthByMonth(state, month)
  if (mode !== 'twr') {
    return round2(wealth.investment)
  }
  return round2(wealth.investment + computeTwrLiquidityValue(state, month))
}

export function getLatestDataMonth(state: State, fallbackMonth: number): number {
  let latest = -1
  state.transactions.forEach((item) => {
    const month = Number(item.month)
    if (Number.isInteger(month) && month >= 0 && month < MONTHS.length) {
      latest = Math.max(latest, month)
    }
  })
  Object.keys(state.snapshots || {}).forEach((monthKey) => {
    const month = Number(monthKey)
    if (Number.isInteger(month) && month >= 0 && month < MONTHS.length) {
      latest = Math.max(latest, month)
    }
  })
  state.contributions.forEach((entry) => {
    const month = monthFromISO(entry.portfolioDate || entry.date)
    if (month !== null) {
      latest = Math.max(latest, month)
    }
  })
  if (latest >= 0) {
    return latest
  }
  return MONTHS[fallbackMonth] ? fallbackMonth : 0
}

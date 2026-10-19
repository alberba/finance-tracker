import type { StatusTone } from '../investment/quote-status'
import {
  isUnlinkedMovementForInstrument,
  normalizeSymbol,
  symbolsMatchInstrument,
} from '../investment/symbol-matching'
import { categoryEmojiKey, getCategoryEmoji } from '../../scripts/category-emoji'
import type { BudgetType, CategoryKey, Entity, Instrument, State } from '../../scripts/types'

export interface CategoryTagViewModel {
  name: string
  emoji: string
  /** Whether `emoji` comes from a user-chosen override rather than the default map. */
  isCustomEmoji: boolean
}

export interface SettingsViewModel {
  year: number
  currency: string
  accounts: Entity[]
  investmentAssets: Entity[]
  liabilities: Entity[]
  incomeCategories: CategoryTagViewModel[]
  expenseCategories: CategoryTagViewModel[]
  investmentCategories: CategoryTagViewModel[]
}

export function categoryKeyToType(key: CategoryKey): BudgetType {
  if (key === 'incomeCategories') {
    return 'income'
  }
  if (key === 'expenseCategories') {
    return 'expense'
  }
  return 'investment'
}

function buildCategoryTags(
  key: CategoryKey,
  names: string[],
  categoryEmojis: Record<string, string>,
): CategoryTagViewModel[] {
  const type = categoryKeyToType(key)
  return names.map((name) => ({
    name,
    emoji: getCategoryEmoji(type, name, categoryEmojis),
    isCustomEmoji: Boolean(categoryEmojis[categoryEmojiKey(type, name)]),
  }))
}

export function buildSettingsViewModel(state: State): SettingsViewModel {
  return {
    year: state.year,
    currency: state.currency || 'EUR',
    accounts: state.accounts,
    investmentAssets: state.investmentAssets,
    liabilities: state.liabilities,
    incomeCategories: buildCategoryTags(
      'incomeCategories',
      state.incomeCategories || [],
      state.categoryEmojis,
    ),
    expenseCategories: buildCategoryTags(
      'expenseCategories',
      state.expenseCategories || [],
      state.categoryEmojis,
    ),
    investmentCategories: buildCategoryTags(
      'investmentCategories',
      state.investmentCategories || [],
      state.categoryEmojis,
    ),
  }
}

export interface AccountRowViewModel {
  id: string
  name: string
  openingBalance: number
  /** Its cash counts as portfolio liquidity for TWR. */
  twrLiquidity: boolean
  /** Stock Events list for the cash of its contributions; only liquidity accounts have one. */
  cashWatchlistId: string
}

/** Each account with everything set about it: liquidity mark and Stock Events cash list. */
export function buildAccountRows(state: State): AccountRowViewModel[] {
  const liquidity = new Set((state.twrLiquidityAccountIds || []).map((id) => String(id)))
  const cash = new Map(
    (state.stockEvents?.cashMappings || []).map((mapping) => [
      mapping.accountId,
      mapping.watchlistId,
    ]),
  )
  return state.accounts.map((account) => {
    const twrLiquidity = liquidity.has(account.id)
    return {
      id: account.id,
      name: account.name,
      openingBalance: account.openingBalance,
      twrLiquidity,
      cashWatchlistId: twrLiquidity ? (cash.get(account.id) ?? '') : '',
    }
  })
}

export interface InstrumentRowViewModel {
  id: string
  symbol: string
  quoteSymbol?: string
  type: Instrument['type']
  market: string
  currency: string
  provider: string
  /** Movements already linked to the instrument. */
  linked: number
  /** Movements that match it but are not linked yet. */
  pending: number
}

export interface AssetRowViewModel {
  id: string
  name: string
  openingBalance: number
  instruments: InstrumentRowViewModel[]
  linked: number
  pending: number
  /** Stock Events symbols of the asset: its instruments' and its movements', sorted. */
  symbols: string[]
}

export interface QuoteSymbolRow {
  id: string
  symbol: string
  currency: string
  assetId: string
  categories: string[]
  movements: number
  instrument: InstrumentRowViewModel | null
}

/** Quotes are configured by symbol, including symbols not assigned to an asset. */
export function buildQuoteSymbolRows(state: State): QuoteSymbolRow[] {
  const investments = state.transactions.filter((tx) => tx.type === 'investment')
  const rows: QuoteSymbolRow[] = state.instruments.map((instrument) => {
    const assetName = state.investmentAssets.find(
      (asset) => asset.id === instrument.investmentAssetId,
    )?.name
    const movements = investments.filter((tx) =>
      tx.instrumentId
        ? tx.instrumentId === instrument.id
        : isUnlinkedMovementForInstrument(tx, instrument, assetName),
    )
    const linked = movements.filter((tx) => tx.instrumentId === instrument.id).length
    return {
      id: instrument.id,
      symbol: instrument.symbol,
      currency: instrument.currency,
      assetId: instrument.investmentAssetId,
      categories: [...new Set(movements.map((tx) => tx.category))].sort(),
      movements: movements.length,
      instrument: {
        ...instrument,
        linked,
        pending: movements.length - linked,
      },
    }
  })
  const unconfigured = new Map<string, typeof investments>()
  for (const tx of investments) {
    const symbol = normalizeSymbol(tx.symbol)
    if (
      !symbol ||
      state.instruments.some(
        (instrument) =>
          tx.instrumentId === instrument.id || symbolsMatchInstrument(symbol, instrument),
      )
    )
      continue
    const movements = unconfigured.get(symbol) ?? []
    movements.push(tx)
    unconfigured.set(symbol, movements)
  }
  for (const [symbol, movements] of unconfigured) {
    const categories = [...new Set(movements.map((tx) => tx.category))].sort()
    const assets = state.investmentAssets.filter((asset) => categories.includes(asset.name))
    rows.push({
      id: `symbol:${symbol}`,
      symbol,
      currency: movements[0]?.movementCurrency || state.currency || 'EUR',
      assetId: assets.length === 1 ? assets[0].id : '',
      categories,
      movements: movements.length,
      instrument: null,
    })
  }
  return rows.sort((a, b) => a.symbol.localeCompare(b.symbol) || a.id.localeCompare(b.id))
}

export interface AssetsViewModel {
  assets: AssetRowViewModel[]
  /** Symbols in movements that belong to no asset. */
  orphanSymbols: string[]
}

/**
 * Each investment asset with all that hangs from it: its quote instruments,
 * the movements linked to them or waiting to be, and the symbols Stock Events
 * syncs for it. A movement symbol goes to the asset of its linked instrument,
 * else of an instrument it matches, else of the asset named by its category.
 */
export function buildAssetsViewModel(state: State): AssetsViewModel {
  const investments = state.transactions.filter((tx) => tx.type === 'investment')
  const assetByInstrument = new Map(
    state.instruments.map((instrument) => [instrument.id, instrument.investmentAssetId]),
  )
  const assetIdByName = new Map(state.investmentAssets.map((asset) => [asset.name, asset.id]))
  const assetIds = new Set(state.investmentAssets.map((asset) => asset.id))
  const symbolsByAsset = new Map<string, Set<string>>()
  const orphans = new Set<string>()

  function claim(assetId: string | undefined, symbol: string): boolean {
    if (!assetId || !assetIds.has(assetId) || !symbol) return false
    const symbols = symbolsByAsset.get(assetId) ?? new Set<string>()
    symbols.add(symbol)
    symbolsByAsset.set(assetId, symbols)
    return true
  }

  state.instruments.forEach((instrument) => {
    const symbol = normalizeSymbol(instrument.symbol)
    if (!claim(instrument.investmentAssetId, symbol) && symbol) orphans.add(symbol)
  })
  investments.forEach((tx) => {
    const symbol = normalizeSymbol(tx.symbol)
    if (!symbol) return
    const owner =
      (tx.instrumentId && assetByInstrument.get(tx.instrumentId)) ||
      state.instruments.find((instrument) => symbolsMatchInstrument(symbol, instrument))
        ?.investmentAssetId ||
      assetIdByName.get(tx.category)
    if (!claim(owner, symbol)) orphans.add(symbol)
  })
  symbolsByAsset.forEach((symbols) => symbols.forEach((symbol) => orphans.delete(symbol)))

  const assets = state.investmentAssets.map((asset) => {
    const instruments = state.instruments
      .filter((instrument) => instrument.investmentAssetId === asset.id)
      .map((instrument) => ({
        id: instrument.id,
        symbol: instrument.symbol,
        ...(instrument.quoteSymbol ? { quoteSymbol: instrument.quoteSymbol } : {}),
        type: instrument.type,
        market: instrument.market,
        currency: instrument.currency,
        provider: instrument.provider,
        linked: investments.filter((tx) => tx.instrumentId === instrument.id).length,
        pending: investments.filter((tx) =>
          isUnlinkedMovementForInstrument(tx, instrument, asset.name),
        ).length,
      }))
    return {
      id: asset.id,
      name: asset.name,
      openingBalance: asset.openingBalance,
      instruments,
      linked: instruments.reduce((sum, instrument) => sum + instrument.linked, 0),
      pending: instruments.reduce((sum, instrument) => sum + instrument.pending, 0),
      symbols: [...(symbolsByAsset.get(asset.id) ?? [])].sort((a, b) => a.localeCompare(b)),
    }
  })

  return { assets, orphanSymbols: [...orphans].sort((a, b) => a.localeCompare(b)) }
}

export interface StockEventsSyncSummary {
  label: string
  /** null: nothing to flag, the label alone says it. */
  tone: StatusTone | null
}

/** The one place a Stock Events symbol check becomes words and a tone. */
export function describeSymbolCheck(result: {
  status: string
  message?: string
}): StockEventsSyncSummary & { tone: StatusTone } {
  if (result.status === 'in-watchlist') return { label: 'En la lista', tone: 'gain' }
  if (result.status === 'detected') return { label: 'Detectado', tone: 'gain' }
  if (result.status === 'not-detected') return { label: 'No detectado', tone: 'warn' }
  return { label: result.message || 'Error', tone: 'loss' }
}

/** How an asset's symbols reach Stock Events, in one line. */
export function summarizeStockEventsSync(
  rows: ReadonlyArray<{
    sync: boolean
    watchlistId: string
    checkResult: { status: string; message?: string } | null
  }>,
): StockEventsSyncSummary {
  if (!rows.length) return { label: 'Sin símbolo', tone: null }
  const synced = rows.filter((row) => row.sync)
  if (!synced.length) return { label: 'No se sincroniza', tone: null }
  if (synced.some((row) => !row.watchlistId)) return { label: 'Falta la lista', tone: 'warn' }
  const checks = synced.map((row) =>
    row.checkResult ? describeSymbolCheck(row.checkResult) : null,
  )
  // The worst check speaks for the asset; unchecked symbols only "sync".
  const problem = checks.find((check) => check && check.tone !== 'gain')
  if (problem) return { ...problem, tone: 'warn' }
  if (checks.some((check) => !check)) return { label: 'Sincroniza', tone: 'gain' }
  return checks.every((check) => check!.label === 'En la lista')
    ? { label: 'En la lista', tone: 'gain' }
    : { label: 'Detectado', tone: 'gain' }
}

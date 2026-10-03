import type { StatusTone } from '../investment/quote-status'
import {
  isUnlinkedMovementForInstrument,
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

export interface TwrLiquidityOptionViewModel {
  id: string
  name: string
  selected: boolean
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
  twrLiquidityOptions: TwrLiquidityOptionViewModel[]
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
  const selected = new Set((state.twrLiquidityAccountIds || []).map((id) => String(id)))

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
    twrLiquidityOptions: (state.accounts || []).map((account) => ({
      id: account.id,
      name: account.name,
      selected: selected.has(account.id),
    })),
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

export interface AssetsViewModel {
  assets: AssetRowViewModel[]
  /** Symbols in movements that belong to no asset. */
  orphanSymbols: string[]
}

function upper(value: unknown): string {
  return String(value || '')
    .trim()
    .toUpperCase()
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
  const symbolsByAsset = new Map<string, Set<string>>()
  const orphans = new Set<string>()

  function claim(assetId: string | undefined, symbol: string): boolean {
    if (!assetId || !symbol) return false
    const symbols = symbolsByAsset.get(assetId) ?? new Set<string>()
    symbols.add(symbol)
    symbolsByAsset.set(assetId, symbols)
    return true
  }

  state.instruments.forEach((instrument) =>
    claim(instrument.investmentAssetId, upper(instrument.symbol)),
  )
  investments.forEach((tx) => {
    const symbol = upper(tx.symbol)
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

/** How an asset's symbols reach Stock Events, in one line. */
export function summarizeStockEventsSync(
  rows: ReadonlyArray<{
    sync: boolean
    watchlistId: string
    checkResult: { status: string } | null
  }>,
): StockEventsSyncSummary {
  if (!rows.length) return { label: 'Sin símbolo', tone: null }
  const synced = rows.filter((row) => row.sync)
  if (!synced.length) return { label: 'No se sincroniza', tone: null }
  if (synced.some((row) => !row.watchlistId)) return { label: 'Falta la lista', tone: 'warn' }
  const statuses = synced.map((row) => row.checkResult?.status)
  if (statuses.some((status) => status === 'not-detected' || status === 'error')) {
    return { label: 'No detectado', tone: 'warn' }
  }
  if (statuses.every((status) => status === 'in-watchlist'))
    return { label: 'En la lista', tone: 'gain' }
  if (statuses.every((status) => status === 'in-watchlist' || status === 'detected')) {
    return { label: 'Detectado', tone: 'gain' }
  }
  return { label: 'Sincroniza', tone: 'gain' }
}

export const INSTRUMENT_TYPE_LABEL: Record<Instrument['type'], string> = {
  stock: 'Acción',
  etf: 'ETF',
  fund: 'Fondo',
  crypto: 'Cripto',
}

/** Quote providers an instrument can use, as the selects list them. */
export const QUOTE_PROVIDERS = [
  { value: 'twelve-data', label: 'Twelve Data' },
  { value: 'yahoo', label: 'Yahoo Finance' },
  { value: 'coingecko', label: 'CoinGecko' },
] as const

export function providerLabel(provider: string): string {
  return QUOTE_PROVIDERS.find((item) => item.value === provider)?.label ?? provider
}

import { INSTRUMENT_TYPE_LABEL, providerLabel } from '../../../domain/investment/instrument-labels'
import { ruleMonthlyEquivalent } from '../../../domain/investment/view-model'
import { frequencyText } from '../../../domain/recurring/occurrences'
import type { AssetRowViewModel, StockEventsSyncSummary } from '../../../domain/settings/view-model'
import { formatMoney, formatShortDate, formatSignedMoney } from '../../../lib/format'
import { parseDecimal } from '../../../lib/number'
import type { Entity, RecurringRule, State } from '../../../scripts/types'

// Configuración in the new design (artboard «Configuración · 2560 px», #443):
// the figures, states and labels its tables show. The components only paint
// what these functions return.

/** The apartados of the index, in the order of the page. */
export const SETTINGS_PARTS = [
  {
    id: 'cuentas',
    label: 'Cuentas',
    icon: 'M4 7h14a2 2 0 0 1 2 2v9a2 2 0 0 1-2 2H5a1 1 0 0 1-1-1V7zM16 13h2',
  },
  { id: 'activos', label: 'Activos', icon: 'M3 17l6-6 4 4 8-8M15 7h6v6' },
  { id: 'pasivos', label: 'Pasivos', icon: 'M7 3h7l5 5v13H7zM14 3v5h5M10 13h6M10 17h4' },
  {
    id: 'categorias',
    label: 'Categorías',
    icon: 'M3 12V4h8l10 10-8 8zM7.5 7.5h.01',
  },
  {
    id: 'recurrentes',
    label: 'Recurrentes',
    icon: 'M4 12a8 8 0 1 0 2.3-5.6M4 4v4h4',
  },
  {
    id: 'preferencias',
    label: 'Preferencias',
    icon: 'M4 6h9M17 6h3M4 12h3M11 12h9M4 18h11M19 18h1M15 4v4M9 10v4M17 16v4',
  },
  {
    id: 'seguridad',
    label: 'Acceso y seguridad',
    icon: 'M6 11h12v9H6zM8.5 11V8a3.5 3.5 0 0 1 7 0v3',
  },
  {
    id: 'conexiones',
    label: 'Conexiones',
    icon: 'M10 14a4 4 0 0 0 5.7 0l3-3a4 4 0 0 0-5.7-5.7l-1 1M14 10a4 4 0 0 0-5.7 0l-3 3a4 4 0 0 0 5.7 5.7l1-1',
  },
] as const

export type SettingsPartId = (typeof SETTINGS_PARTS)[number]['id']

/** An amount typed in a field, as euros; null when it is not a number. */
export function parseAmount(text: string): number | null {
  const value = parseDecimal(text)
  return Number.isFinite(value) ? value : null
}

/** The working year typed in Preferencias; null when outside what the app handles. */
export function parseYear(text: string): number | null {
  const value = Number(text.trim())
  return Number.isInteger(value) && value >= 2000 && value <= 2100 ? value : null
}

/** The currency typed in Preferencias: three letters, upper case; null otherwise. */
export function parseCurrency(text: string): string | null {
  const value = text.trim().toUpperCase()
  return /^[A-Z]{3}$/.test(value) ? value : null
}

/**
 * The starting balance typed in an add row, as the text the store takes:
 * empty is zero, a number is itself, anything else is null (not accepted).
 */
export function openingBalanceText(text: string): string | null {
  if (!text.trim()) return '0'
  const value = parseAmount(text)
  return value === null ? null : String(value)
}

export interface AccountRow {
  id: string
  name: string
  openingBalance: number
  /** «Incluida» when its cash counts as liquidity of the portfolio, else «—». */
  liquidity: string
  /** The Stock Events list of its cash: its name, «Sin lista», or «—» without liquidity. */
  list: string
}

export interface AccountsTable {
  rows: AccountRow[]
  total: number
  /** «3 de 5 en liquidez». */
  liquidityNote: string
}

/** The accounts with their starting balance and what the portfolio does with their cash. */
export function accountsTable(
  accounts: ReadonlyArray<{
    id: string
    name: string
    openingBalance: number
    twrLiquidity: boolean
    cashWatchlistId: string
  }>,
  watchlistName: (id: string) => string,
): AccountsTable {
  const rows = accounts.map((account) => ({
    id: account.id,
    name: account.name,
    openingBalance: account.openingBalance,
    liquidity: account.twrLiquidity ? 'Incluida' : '—',
    list: account.twrLiquidity
      ? (account.cashWatchlistId && watchlistName(account.cashWatchlistId)) || 'Sin lista'
      : '—',
  }))
  const included = accounts.filter((account) => account.twrLiquidity).length
  return {
    rows,
    total: accounts.reduce((sum, account) => sum + account.openingBalance, 0),
    liquidityNote: `${included} de ${accounts.length} en liquidez`,
  }
}

export interface AssetRow {
  id: string
  name: string
  openingBalance: number
  /** «ETF», «Cripto»…; empty without a quote instrument. */
  kind: string
  /** The first symbol the asset trades under; empty without one. */
  symbol: string
  /** Where its price comes from; empty without a quote instrument. */
  provider: string
  linked: number
  /** Movements waiting to be linked to an instrument. */
  pending: number
  sync: string
  /** The row needs a look: movements to link or a symbol Stock Events cannot sync. */
  warn: boolean
}

export interface AssetsTable {
  rows: AssetRow[]
  total: number
  /** Assets that need a look, for the «1 aviso en Activos» of the header. */
  alerts: number
}

/** The investment assets with their quote, their links and how they sync. */
export function assetsTable(
  assets: ReadonlyArray<
    Pick<
      AssetRowViewModel,
      'id' | 'name' | 'openingBalance' | 'instruments' | 'linked' | 'pending' | 'symbols'
    > & {
      sync: StockEventsSyncSummary
    }
  >,
): AssetsTable {
  const rows = assets.map((asset) => {
    const instrument = asset.instruments[0]
    const warn = asset.pending > 0 || asset.sync.tone === 'warn'
    return {
      id: asset.id,
      name: asset.name,
      openingBalance: asset.openingBalance,
      kind: instrument ? INSTRUMENT_TYPE_LABEL[instrument.type] : '',
      symbol: asset.symbols[0] ?? '',
      provider: instrument ? providerLabel(instrument.provider) : '',
      linked: asset.linked,
      pending: asset.pending,
      sync:
        asset.pending > 0
          ? `Revisar ${asset.pending === 1 ? '1 movimiento' : `${asset.pending} movimientos`}`
          : asset.sync.label,
      warn,
    }
  })
  return {
    rows,
    total: assets.reduce((sum, asset) => sum + asset.openingBalance, 0),
    alerts: rows.filter((row) => row.warn).length,
  }
}

/** «1 aviso en Activos», «3 avisos en Activos»; empty when there is none. */
export function alertsLabel(alerts: number): string {
  if (alerts === 0) return ''
  return alerts === 1 ? '1 aviso en Activos' : `${alerts} avisos en Activos`
}

export interface LiabilitiesTable {
  rows: Entity[]
  total: number
}

export function liabilitiesTable(liabilities: readonly Entity[]): LiabilitiesTable {
  return {
    rows: [...liabilities],
    total: liabilities.reduce((sum, liability) => sum + liability.openingBalance, 0),
  }
}

export interface RuleRow {
  id: string
  name: string
  /** «Ocio · Cuenta nómina». */
  detail: string
  frequency: string
  /** The next date, or why there is none. */
  next: string
  /** The amount with its sign; savings move money between accounts and carry none. */
  amount: string
  income: boolean
  active: boolean
}

export interface RulesTable {
  rows: RuleRow[]
  /** What the active rules add to the month, savings aside. */
  net: number
  netText: string
}

/** The income, expense and saving rules (investment ones live in Inversión) and their month. */
export function rulesTable(
  rules: readonly RecurringRule[],
  accounts: readonly Entity[],
): RulesTable {
  const own = rules.filter((rule) => rule.type !== 'investment')
  const rows = own.map((rule) => ({
    id: rule.id,
    name: rule.description,
    detail: `${rule.category} · ${accounts.find((account) => account.id === rule.accountId)?.name ?? ''}`,
    frequency: frequencyText(rule),
    next:
      rule.active && rule.nextOccurrenceDate
        ? formatShortDate(rule.nextOccurrenceDate)
        : rule.active
          ? 'Sin vencimientos'
          : 'En pausa',
    amount:
      rule.type === 'saving'
        ? formatMoney(rule.amount)
        : formatSignedMoney(rule.type === 'income' ? rule.amount : -rule.amount),
    income: rule.type === 'income',
    active: rule.active,
  }))
  const net = own
    .filter((rule) => rule.active && rule.type !== 'saving')
    .reduce((sum, rule) => sum + (rule.type === 'income' ? 1 : -1) * ruleMonthlyEquivalent(rule), 0)
  return { rows, net, netText: `≈ ${formatSignedMoney(net)}` }
}

/** The counter beside each apartado of the index; null where it has none. */
export function partCounts(
  state: Pick<
    State,
    | 'accounts'
    | 'investmentAssets'
    | 'liabilities'
    | 'incomeCategories'
    | 'expenseCategories'
    | 'investmentCategories'
    | 'recurringRules'
  >,
): Record<SettingsPartId, number | null> {
  return {
    cuentas: state.accounts.length,
    activos: state.investmentAssets.length,
    pasivos: state.liabilities.length,
    categorias:
      state.incomeCategories.length +
      state.expenseCategories.length +
      state.investmentCategories.length,
    recurrentes: state.recurringRules.filter((rule) => rule.type !== 'investment').length,
    preferencias: null,
    seguridad: null,
    conexiones: 2,
  }
}

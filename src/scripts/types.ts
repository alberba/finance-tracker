export const TRANSACTION_TYPES = ['income', 'expense', 'investment'] as const
export type TransactionType = (typeof TRANSACTION_TYPES)[number]
export const SUBSCRIPTION_FREQUENCIES = ['weekly', 'monthly', 'quarterly', 'yearly'] as const
export type SubscriptionFrequency = (typeof SUBSCRIPTION_FREQUENCIES)[number]
export const INVESTMENT_SIDES = ['buy', 'sell'] as const
export type InvestmentSide = (typeof INVESTMENT_SIDES)[number]
export type BudgetType = TransactionType
export type TxSortColumn = 'date' | 'amount' | 'account' | 'type' | 'category' | 'description'
export type SortDirection = 'asc' | 'desc'
export type InvestmentSubTab = 'dashboard' | 'movements' | 'contributions' | 'recurring'
export type TransactionsSubTab = 'registry' | 'subscriptions'
export type SnapshotKind = 'accounts' | 'investments' | 'liabilities'
export type EntityKey = 'accounts' | 'investmentAssets' | 'liabilities'
export type InstrumentType = 'stock' | 'etf' | 'fund' | 'crypto'
export type QuoteStatus = 'fresh' | 'stale' | 'unavailable'
export type RecurringFrequency = 'daily' | 'weekly' | 'monthly' | 'monthEnd' | 'yearly'
export type PendingMovementStatus = 'pending' | 'confirmed' | 'skipped' | 'cancelled'
export type CategoryKey = 'incomeCategories' | 'expenseCategories' | 'investmentCategories'
export type GoalKey =
  'short' | 'medium' | 'long' | 'investmentTotal' | 'investmentFunds' | 'investmentCrypto'

export interface Entity {
  id: string
  name: string
  openingBalance: number
}

export interface Transaction {
  remoteOperation?: import('../lib/bitvavo-types').RemoteOperation
  id: string
  date: string
  month: number
  type: TransactionType
  accountId: string
  category: string
  description: string
  amount: number
  time?: string
  symbol?: string
  instrumentId?: string
  side?: InvestmentSide
  unitPrice?: number
  units?: number
  fee?: number
  movementCurrency?: string
  declared?: boolean
  subscriptionId?: string
  subscriptionChargeDate?: string
  createdAt?: string
}

export interface Subscription {
  id: string
  name: string
  amount: number
  accountId: string
  category: string
  frequency: SubscriptionFrequency
  startDate: string
  nextChargeDate: string
  active: boolean
}

export interface Instrument {
  id: string
  investmentAssetId: string
  type: InstrumentType
  symbol: string
  market: string
  currency: string
  provider: string
  active: boolean
  openingUnits?: number
  holdingUnits?: number
  holdingsAsOf?: string
  holdingsUpdatedAt?: string
  holdingsSource?: 'manual'
}

export interface Quote {
  instrumentId: string
  price: number
  currency: string
  timestamp: string
  source: string
  status: QuoteStatus
  isStale: boolean
  previousClose: number | null
  changePercent: number | null
}

export interface RecurringRule {
  id: string
  type: TransactionType
  accountId: string
  category: string
  description: string
  amount: number
  symbol?: string
  side?: InvestmentSide
  units?: number
  unitPrice?: number
  fee?: number
  time?: string
  frequency: RecurringFrequency
  interval: number
  startDate: string
  endDate: string | null
  active: boolean
  lastExecutionDate: string | null
  nextOccurrenceDate: string | null
}

export interface PendingMovement {
  id: string
  occurrenceKey: string
  ruleId: string
  occurrenceDate: string
  type: TransactionType
  accountId: string
  category: string
  description: string
  amount: number
  symbol?: string
  side?: InvestmentSide
  units?: number
  unitPrice?: number
  fee?: number
  time?: string
  status: PendingMovementStatus
  createdAt: string
  updatedAt: string
  transactionId: string | null
}

export interface SnapshotRow {
  month: number
  accounts: Record<string, number>
  investments: Record<string, number>
  liabilities: Record<string, number>
}

export interface Goal {
  name: string
  targetYear: number
  targetAmount: number
}

export interface Contribution {
  id: string
  date: string
  amount: number
  portfolioDate: string
  portfolioValue: number
  flow: number
  flowAllocations?: Array<{
    accountId: string
    amount: number
  }>
  flowSource?: 'legacy' | 'allocations'
  warnings?: string[]
}

export interface StockEventsSymbolMapping {
  symbol: string
  sync: boolean
  watchlistId: string
  /** Ticker tal y como lo conoce Stock Events (p. ej. AGED.MI); vacío = usar `symbol`. */
  targetSymbol: string
  hidden: boolean
}

export interface StockEventsCashMapping {
  accountId: string
  watchlistId: string
}

export interface StockEventsCashSyncEntry {
  contributionDate: string
  accountId: string
  watchlistId: string
  syncedAmount: number
}

export interface StockEventsSettings {
  enabled: boolean
  apiKey: string
  /** Buys/sells synced to Stock Events move the watchlist cash (`toCash`). */
  tradesToCash?: boolean
  symbolMappings: StockEventsSymbolMapping[]
  cashMappings?: StockEventsCashMapping[]
  cashSyncEntries?: StockEventsCashSyncEntry[]
}

export interface StateMeta {
  source: string
  generatedAt: string
  version: number
  savedAt: string | null
}

export interface State {
  onboardingPresented: boolean
  onboardingDismissed: boolean
  onboardingAccountCompleted: boolean
  onboardingMovementCompleted: boolean
  onboardingCompleted: boolean

  meta: StateMeta
  year: number
  currency: string
  twrLiquidityAccountIds: string[]
  accounts: Entity[]
  investmentAssets: Entity[]
  liabilities: Entity[]
  incomeCategories: string[]
  expenseCategories: string[]
  investmentCategories: string[]
  /**
   * User-chosen emoji overrides, keyed by `categoryEmojiKey(type, category)`.
   * Categories without an entry here fall back to the built-in map/defaults
   * in `scripts/category-emoji.ts`.
   */
  categoryEmojis: Record<string, string>
  transactions: Transaction[]
  subscriptions: Subscription[]
  snapshots: Record<string, SnapshotRow>
  budget: Record<BudgetType, Record<string, number[]>>
  goals: Record<GoalKey, Goal>
  contributions: Contribution[]
  instruments: Instrument[]
  quotes: Record<string, Quote>
  recurringRules: RecurringRule[]
  pendingMovements: PendingMovement[]
  stockEvents: StockEventsSettings
}

export interface MonthTotals {
  income: number
  expense: number
  investment: number
}

export interface ContributionMetricRow {
  id: string
  date: string
  amount: number
  portfolioValue: number
  flow: number
  nav: number
  unitsBefore: number
  unitsAfter: number
  periodReturn: number | null
  cumulativeReturn: number | null
}

export const MONTHS = [
  'ENERO',
  'FEBRERO',
  'MARZO',
  'ABRIL',
  'MAYO',
  'JUNIO',
  'JULIO',
  'AGOSTO',
  'SEPTIEMBRE',
  'OCTUBRE',
  'NOVIEMBRE',
  'DICIEMBRE',
] as const

export const SECTION_ROUTE_MAP = {
  dashboard: '/dashboard',
  transactions: '/movimientos',
  budget: '/presupuesto',
  wealth: '/patrimonio',
  investment: '/inversion',
  goals: '/objetivos',
  settings: '/configuracion',
  data: '/datos',
} as const

export type SectionId = keyof typeof SECTION_ROUTE_MAP

export const ROUTE_SECTION_MAP: Record<string, SectionId> = Object.fromEntries(
  Object.entries(SECTION_ROUTE_MAP).map(([sectionId, routePath]) => [routePath, sectionId]),
) as Record<string, SectionId>

const GOAL_KEYS = [
  'short',
  'medium',
  'long',
  'investmentTotal',
  'investmentFunds',
  'investmentCrypto',
] as const
const ENTITY_KEYS = ['accounts', 'investmentAssets', 'liabilities'] as const
const CATEGORY_KEYS = ['incomeCategories', 'expenseCategories', 'investmentCategories'] as const
const SNAPSHOT_KINDS = ['accounts', 'investments', 'liabilities'] as const

export const DEFAULT_GOALS = (year: number): Record<GoalKey, Goal> => ({
  short: {
    name: 'Objetivo corto plazo',
    targetYear: year,
    targetAmount: 10000,
  },
  medium: {
    name: 'Objetivo medio plazo',
    targetYear: year + 1,
    targetAmount: 50000,
  },
  long: {
    name: 'Objetivo largo plazo',
    targetYear: year + 4,
    targetAmount: 150000,
  },
  investmentTotal: {
    name: 'Objetivo inversión total',
    targetYear: year + 1,
    targetAmount: 50000,
  },
  investmentFunds: {
    name: 'Objetivo fondos indexados',
    targetYear: year + 1,
    targetAmount: 50000,
  },
  investmentCrypto: {
    name: 'Objetivo criptomonedas',
    targetYear: year + 1,
    targetAmount: 15000,
  },
})

export function isSectionId(value: string): value is SectionId {
  return Object.prototype.hasOwnProperty.call(SECTION_ROUTE_MAP, value)
}

export function isEntityKey(value: string): value is EntityKey {
  return (ENTITY_KEYS as readonly string[]).includes(value)
}

export function isCategoryKey(value: string): value is CategoryKey {
  return (CATEGORY_KEYS as readonly string[]).includes(value)
}

export function isBudgetType(value: string): value is BudgetType {
  return (TRANSACTION_TYPES as readonly string[]).includes(value)
}

export function isSnapshotKind(value: string): value is SnapshotKind {
  return (SNAPSHOT_KINDS as readonly string[]).includes(value)
}

export function isTransactionType(value: string): value is TransactionType {
  return (TRANSACTION_TYPES as readonly string[]).includes(value)
}

export function isSubscriptionFrequency(value: string): value is SubscriptionFrequency {
  return (SUBSCRIPTION_FREQUENCIES as readonly string[]).includes(value)
}

export function isInvestmentSide(value: string): value is InvestmentSide {
  return (INVESTMENT_SIDES as readonly string[]).includes(value)
}

export function isGoalKey(value: string): value is GoalKey {
  return (GOAL_KEYS as readonly string[]).includes(value)
}

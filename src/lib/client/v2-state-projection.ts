import { remoteOperationSchema } from '../bitvavo-types'
import { categoryEmojiKey } from '../../scripts/category-emoji'
import { normalizeState } from '../../scripts/state'
import { getFirstUpcomingChargeDate } from '../../scripts/subscriptions'
import {
  isSubscriptionFrequency,
  type GoalKey,
  type InvestmentSide,
  type State,
} from '../../scripts/types'
import { monthFromISO, todayISO } from '../../scripts/utils'
import type { CachedEntity } from './idb-cache'

export interface SyncV2Bootstrap {
  revision: number
  settings: ({ currency?: string } & Record<string, unknown>) | null
  accounts: CachedEntity[]
  categories: CachedEntity[]
  transactions: CachedEntity[]
  subscriptions: CachedEntity[]
  recurringRules: CachedEntity[]
  pendingMovements: CachedEntity[]
  budgetEntries: CachedEntity[]
  goals: CachedEntity[]
  wealthSnapshots: Array<CachedEntity & { balances?: CachedEntity[] }>
  contributions: Array<CachedEntity & { allocations?: CachedEntity[] }>
  userInstruments: CachedEntity[]
  instruments?: Array<CachedEntity & { userInstrument: CachedEntity; quotes: CachedEntity[] }>
  twrLiquidityAccounts?: CachedEntity[]
  stockeventsSymbolMappings?: CachedEntity[]
  stockeventsCashMappings?: CachedEntity[]
  stockeventsCashSyncEntries?: CachedEntity[]
}

const CATEGORY_STATE_KEYS = {
  income: 'incomeCategories',
  expense: 'expenseCategories',
  investment: 'investmentCategories',
} as const

/**
 * The operation of an investment movement template, as the domain types
 * want it: absent rather than zeroed when the template is not an
 * investment, so reopening an expense rule does not offer it a symbol.
 */
function projectOperation(entity: CachedEntity): Record<string, unknown> {
  return {
    ...(entity.symbol ? { symbol: String(entity.symbol) } : {}),
    ...(entity.side ? { side: String(entity.side) as InvestmentSide } : {}),
    ...(entity.units === null || entity.units === undefined ? {} : { units: Number(entity.units) }),
    ...(entity.unitPrice === null || entity.unitPrice === undefined
      ? {}
      : { unitPrice: Number(entity.unitPrice) }),
    ...(entity.fee === null || entity.fee === undefined ? {} : { fee: Number(entity.fee) }),
    ...(entity.time ? { time: String(entity.time) } : {}),
  }
}

function legacyId(entity: CachedEntity): string {
  return String(entity.legacyId || entity.id)
}

function categoryNamesById(entities: CachedEntity[]): Map<string, string> {
  return new Map(entities.map((entity) => [entity.id, String(entity.name || 'Sin categoría')]))
}

function accountLegacyIdsById(entities: CachedEntity[]): Map<string, string> {
  return new Map(entities.map((entity) => [entity.id, legacyId(entity)]))
}

const ISO_DATE_PATTERN = /^\d{4}-\d{2}-\d{2}$/

function subscriptionStartDate(subscription: CachedEntity): string {
  const startDate = String(subscription.startDate || '').slice(0, 10)
  if (ISO_DATE_PATTERN.test(startDate)) return startDate

  const createdDate = String(subscription.createdAt || '').slice(0, 10)
  if (!ISO_DATE_PATTERN.test(createdDate)) return ''

  const billingDay = Number(subscription.legacyBillingDay)
  if (!Number.isInteger(billingDay) || billingDay < 1 || billingDay > 31) return createdDate

  const [year, month] = createdDate.split('-').map(Number)
  const lastDay = new Date(Date.UTC(year, month, 0)).getUTCDate()
  return `${createdDate.slice(0, 8)}${String(Math.min(billingDay, lastDay)).padStart(2, '0')}`
}

/** Projects the relational sync-v2 read model into the UI's current State model. */
export function projectSyncV2State(bootstrap: SyncV2Bootstrap): State {
  const projected = normalizeState({
    meta: { source: 'sync-v2', generatedAt: new Date().toISOString(), version: 1, savedAt: null },
    year: new Date().getFullYear(),
    currency: bootstrap.settings?.currency || 'EUR',
    twrLiquidityAccountIds: [],
    accounts: [],
    investmentAssets: [],
    liabilities: [],
    incomeCategories: [],
    expenseCategories: [],
    investmentCategories: [],
    categoryEmojis: {},
    transactions: [],
    subscriptions: [],
    snapshots: {},
    budget: { income: {}, expense: {}, investment: {} },
    goals: {},
    contributions: [],
    instruments: [],
    quotes: {},
    recurringRules: [],
    pendingMovements: [],
    stockEvents: { enabled: false, apiKey: '', symbolMappings: [] },
  })
  const categories = categoryNamesById(bootstrap.categories)
  const accountIds = accountLegacyIdsById(bootstrap.accounts)

  projected.currency = String(bootstrap.settings?.currency || projected.currency || 'EUR')
  const projectAccount = (account: CachedEntity) => ({
    id: legacyId(account),
    name: String(account.name || ''),
    openingBalance: Number(account.openingBalance || 0),
  })
  projected.accounts = bootstrap.accounts
    .filter((account) => account.kind === 'cash')
    .map(projectAccount)
  projected.investmentAssets = bootstrap.accounts
    .filter((account) => account.kind === 'investment')
    .map(projectAccount)
  projected.liabilities = bootstrap.accounts
    .filter((account) => account.kind === 'liability')
    .map(projectAccount)
  projected.twrLiquidityAccountIds = (bootstrap.twrLiquidityAccounts || [])
    .map((entry) => accountIds.get(String(entry.accountId)) || String(entry.legacyId || ''))
    .filter(Boolean)

  const categoryEmojis: Record<string, string> = {}
  for (const [kind, stateKey] of Object.entries(CATEGORY_STATE_KEYS)) {
    const categoriesOfKind = bootstrap.categories
      .filter((category) => category.kind === kind)
      .sort((left, right) => Number(left.sortOrder || 0) - Number(right.sortOrder || 0))
    projected[stateKey] = categoriesOfKind.map((category) => String(category.name))
    for (const category of categoriesOfKind) {
      if (category.emoji) {
        categoryEmojis[
          categoryEmojiKey(kind as keyof typeof CATEGORY_STATE_KEYS, String(category.name))
        ] = String(category.emoji)
      }
    }
  }
  projected.categoryEmojis = categoryEmojis

  projected.transactions = bootstrap.transactions.map((transaction) => {
    const remote = remoteOperationSchema.safeParse(transaction.remoteOperation)
    const trade = transaction.tradeDetail as CachedEntity | null | undefined
    const instrument = (bootstrap.instruments || []).find((item) => item.id === trade?.instrumentId)
    return {
      id: legacyId(transaction),
      date: String(transaction.date),
      month: monthFromISO(String(transaction.date)) ?? 0,
      type: String(transaction.type) as State['transactions'][number]['type'],
      accountId:
        accountIds.get(String(transaction.accountId)) || String(transaction.accountId || ''),
      category: categories.get(String(transaction.categoryId)) || 'Sin categoría',
      description: String(transaction.description || ''),
      amount: Number(transaction.amount || 0),
      createdAt: String(transaction.createdAt || ''),
      ...(transaction.time ? { time: String(transaction.time) } : {}),
      declared: Boolean(transaction.declared),
      movementCurrency: String(transaction.currency || trade?.currency || projected.currency),
      ...(remote.success ? { remoteOperation: remote.data } : {}),
      ...(trade
        ? {
            side: String(trade.side) as State['transactions'][number]['side'],
            units: Number(trade.quantity || 0),
            unitPrice: Number(trade.price || 0),
            fee: Number(trade.fee || 0),
            // The stored ticker is what the user typed; the instrument is only a
            // fallback for rows migrated from v1, which have no `symbol` column.
            ...(trade.symbol || instrument
              ? { symbol: String(trade.symbol || instrument?.symbol) }
              : {}),
            ...(instrument ? { instrumentId: legacyId(instrument) } : {}),
          }
        : {}),
    }
  })

  projected.subscriptions = bootstrap.subscriptions.map((subscription) => {
    const frequencyCandidate = String(subscription.frequency)
    const frequency = isSubscriptionFrequency(frequencyCandidate) ? frequencyCandidate : 'monthly'
    const startDate = subscriptionStartDate(subscription)
    const storedNextChargeDate = String(subscription.nextChargeDate || '')
    const nextChargeDate = ISO_DATE_PATTERN.test(storedNextChargeDate)
      ? storedNextChargeDate
      : getFirstUpcomingChargeDate({ frequency, startDate, nextChargeDate: startDate }, todayISO())

    return {
      id: legacyId(subscription),
      name: String(subscription.name || ''),
      amount: Number(subscription.amount || 0),
      accountId: accountIds.get(String(subscription.accountId)) || '',
      category: categories.get(String(subscription.categoryId)) || 'Sin categoría',
      frequency,
      startDate,
      nextChargeDate,
      active: subscription.isActive !== false,
    }
  })

  projected.budget = { income: {}, expense: {}, investment: {} }
  for (const entry of bootstrap.budgetEntries) {
    const kind = bootstrap.categories.find((category) => category.id === entry.categoryId)
      ?.kind as keyof State['budget']
    if (!(kind in projected.budget)) continue
    const category = categories.get(String(entry.categoryId)) || 'Sin categoría'
    const amounts = projected.budget[kind][category] || Array(12).fill(0)
    // `entry.month` is canonical 1-12 (ADR: month is 1-12 in DB/commands/domain);
    // the UI's array is 0-11, so the conversion happens here, at the edge of
    // the projection (audit §4.5 — without it, every month is off by one and
    // December has no slot to land in at all).
    amounts[Number(entry.month) - 1] = Number(entry.amount || 0)
    projected.budget[kind][category] = amounts
  }

  for (const goal of bootstrap.goals) {
    const key = String(goal.key) as GoalKey
    if (!(key in projected.goals)) continue
    projected.goals[key] = {
      name: String(goal.name || ''),
      targetYear: Number(goal.targetYear || projected.year),
      targetAmount: Number(goal.targetAmount || 0),
    }
  }

  projected.contributions = bootstrap.contributions.map((contribution) => ({
    id: legacyId(contribution),
    date: String(contribution.date),
    amount: Number(contribution.amount || 0),
    portfolioDate: String(contribution.portfolioDate || contribution.date),
    portfolioValue: Number(contribution.portfolioValue || 0),
    flow: Number(contribution.flow || 0),
    flowAllocations: (contribution.allocations || []).map((allocation) => ({
      accountId: accountIds.get(String(allocation.accountId)) || String(allocation.accountId || ''),
      amount: Number(allocation.amount || 0),
    })),
  }))

  // A snapshot's identity is `(year, month)` (ADR 0001), while the UI's map is
  // keyed by month alone for the state's year: a row from another year must
  // never take a slot in it (audit §4.6 — projecting every row into the same
  // month-keyed map mixed the years together).
  projected.snapshots = Object.fromEntries(
    bootstrap.wealthSnapshots
      .filter((snapshot) => Number(snapshot.year) === projected.year)
      .map((snapshot) => {
        // `snapshot.month` is the server's canonical 1-12; `State.snapshots` is
        // keyed (and stores `.month`) 0-based, matching `ui.snapshotMonth`.
        const month = Number(snapshot.month) - 1
        const balances: State['snapshots'][string] = {
          month,
          accounts: {},
          investments: {},
          liabilities: {},
        }
        for (const balance of snapshot.balances || []) {
          const accountId =
            accountIds.get(String(balance.accountId)) || String(balance.accountId || '')
          if (!accountId) continue
          const kind = bootstrap.accounts.find((account) => account.id === balance.accountId)?.kind
          if (kind === 'investment') balances.investments[accountId] = Number(balance.balance || 0)
          else if (kind === 'liability')
            balances.liabilities[accountId] = Number(balance.balance || 0)
          else balances.accounts[accountId] = Number(balance.balance || 0)
        }
        return [String(month), balances]
      }),
  )

  const recurringRuleIds = new Map(
    bootstrap.recurringRules.map((rule) => [rule.id, legacyId(rule)]),
  )
  projected.recurringRules = bootstrap.recurringRules.map((rule) => ({
    id: legacyId(rule),
    type: String(rule.type) as State['recurringRules'][number]['type'],
    accountId: accountIds.get(String(rule.accountId)) || '',
    category: categories.get(String(rule.categoryId)) || 'Sin categoría',
    description: String(rule.name || ''),
    amount: Number(rule.amount || 0),
    ...projectOperation(rule),
    frequency: String(rule.frequency) as State['recurringRules'][number]['frequency'],
    interval: Number(rule.interval || 1),
    startDate: String(rule.startDate || rule.nextRunDate || ''),
    endDate: rule.endDate ? String(rule.endDate) : null,
    active: rule.status === 'active',
    lastExecutionDate: rule.lastExecutionDate ? String(rule.lastExecutionDate) : null,
    nextOccurrenceDate: rule.nextRunDate ? String(rule.nextRunDate) : null,
  }))
  projected.pendingMovements = bootstrap.pendingMovements.map((pending) => ({
    id: legacyId(pending),
    occurrenceKey: `${recurringRuleIds.get(String(pending.recurringRuleId)) || pending.recurringRuleId}:${pending.dueDate}`,
    ruleId:
      recurringRuleIds.get(String(pending.recurringRuleId)) || String(pending.recurringRuleId),
    occurrenceDate: String(pending.dueDate),
    type: String(pending.type || 'expense') as State['pendingMovements'][number]['type'],
    accountId: accountIds.get(String(pending.accountId)) || '',
    category: categories.get(String(pending.categoryId)) || 'Sin categoría',
    description: String(pending.description || ''),
    amount: Number(pending.amount || 0),
    ...projectOperation(pending),
    status: String(pending.status) as State['pendingMovements'][number]['status'],
    createdAt: String(pending.createdAt || ''),
    updatedAt: String(pending.updatedAt || ''),
    transactionId: pending.transactionId ? String(pending.transactionId) : null,
  }))

  projected.instruments = (bootstrap.instruments || []).map((instrument) => ({
    id: legacyId(instrument),
    investmentAssetId: String(instrument.userInstrument.alias || ''),
    type: String(instrument.assetClass || 'stock') as State['instruments'][number]['type'],
    symbol: String(instrument.symbol),
    market: '',
    currency: String(instrument.currency),
    provider: String(instrument.provider),
    active: true,
  }))
  projected.quotes = Object.fromEntries(
    (bootstrap.instruments || []).flatMap((instrument) => {
      const latest = [...instrument.quotes]
        .sort((left, right) => String(left.quotedAt).localeCompare(String(right.quotedAt)))
        .at(-1)
      if (!latest) return []
      const instrumentId = legacyId(instrument)
      return [
        [
          instrumentId,
          {
            instrumentId,
            price: Number(latest.price || 0),
            currency: String(latest.currency),
            timestamp: String(latest.quotedAt),
            source: 'sync-v2',
            status: 'fresh' as const,
            isStale: false,
            previousClose: null,
            changePercent: null,
          },
        ],
      ]
    }),
  )
  const stockeventsEnabledRaw =
    bootstrap.settings?.stockeventsEnabled ?? bootstrap.settings?.stockevents_enabled
  projected.stockEvents.enabled = stockeventsEnabledRaw === true || stockeventsEnabledRaw === 1
  const tradesToCashRaw =
    bootstrap.settings?.stockeventsTradesToCash ?? bootstrap.settings?.stockevents_trades_to_cash
  projected.stockEvents.tradesToCash = tradesToCashRaw === true || tradesToCashRaw === 1
  projected.stockEvents.symbolMappings = (bootstrap.stockeventsSymbolMappings || []).map(
    (mapping) => ({
      symbol: String(mapping.legacyId || mapping.stockeventsSymbol).toUpperCase(),
      sync: mapping.sync === true || mapping.sync === 1,
      watchlistId: String(mapping.watchlistId || ''),
      targetSymbol: String(mapping.stockeventsSymbol || '').toUpperCase(),
      hidden: mapping.hidden === true || mapping.hidden === 1,
    }),
  )
  // Server rows (and queued `settingsUpdate` overlays) address accounts by
  // their server id; the UI model addresses them by legacy id.
  const toLocalAccountId = (serverId: unknown): string => {
    const key = String(serverId || '')
    return accountIds.get(key) || key
  }
  const queuedCashMappings = (bootstrap.settings as Record<string, unknown> | null)
    ?.stockeventsCashMappings
  const cashSource = Array.isArray(queuedCashMappings)
    ? (queuedCashMappings as CachedEntity[])
    : bootstrap.stockeventsCashMappings || []
  projected.stockEvents.cashMappings = cashSource
    .filter((mapping) => String(mapping.watchlistId || ''))
    .map((mapping) => ({
      accountId: toLocalAccountId(mapping.accountId),
      watchlistId: String(mapping.watchlistId),
    }))
  projected.stockEvents.cashSyncEntries = (bootstrap.stockeventsCashSyncEntries || []).map(
    (entry) => ({
      contributionDate: String(entry.contributionDate || '').slice(0, 10),
      accountId: toLocalAccountId(entry.accountId),
      watchlistId: String(entry.watchlistId || ''),
      syncedAmount: Number(entry.syncedAmount ?? 0),
    }),
  )

  return normalizeState(projected)
}

/**
 * The one read inventory of a user's private collections, shared by the
 * client bootstrap and the JSON backup export.
 *
 * Both serializations differ only in how they present the same rows (the
 * bootstrap calls a movement's operation `tradeDetail`, the export projects it
 * as `operation`) and in the metadata each one adds (`revision` and the
 * catalog/quotes-derived `instruments` for bootstrap; `format`/`exportedAt`/
 * `userId` for the export). Keeping the reads here means a batching or scope
 * improvement reaches both instead of drifting between them.
 *
 * Pure read: it never writes and opens no transaction, so it promises no
 * snapshot guarantee beyond what the caller already had.
 *
 * The optional year narrows exactly the collections the routes have always
 * narrowed: movements by their date prefix, budget entries and wealth
 * snapshots by their numeric year. Contributions are never filtered — their
 * allocations are part of the always-full contribution history.
 */

import { Effect } from 'effect'
import type { Database, DatabaseError } from '../../db/database'
import * as accountsRepository from '../../db/repositories/accounts'
import * as budgetEntriesRepository from '../../db/repositories/budget-entries'
import * as contributionsRepository from '../../db/repositories/contributions'
import * as goalsRepository from '../../db/repositories/goals'
import * as marketRepository from '../../db/repositories/market'
import * as pendingMovementsRepository from '../../db/repositories/pending-movements'
import * as recurringRulesRepository from '../../db/repositories/recurring-rules'
import * as stockeventsCashMappingsRepository from '../../db/repositories/stockevents-cash-mappings'
import * as stockeventsSymbolMappingsRepository from '../../db/repositories/stockevents-symbol-mappings'
import * as subscriptionsRepository from '../../db/repositories/subscriptions'
import * as transactionsRepository from '../../db/repositories/transactions'
import * as userSettingsRepository from '../../db/repositories/user-settings'
import * as wealthRepository from '../../db/repositories/wealth'
import type {
  AccountRow,
  CategoryRow,
  TwrLiquidityAccountRow,
} from '../../db/repositories/accounts'
import type { BudgetEntryRow } from '../../db/repositories/budget-entries'
import type {
  ContributionAllocationRow,
  ContributionRow,
} from '../../db/repositories/contributions'
import type { GoalRow } from '../../db/repositories/goals'
import type { UserInstrumentRow } from '../../db/repositories/market'
import type { PendingMovementRow } from '../../db/repositories/pending-movements'
import type { RecurringRuleRow } from '../../db/repositories/recurring-rules'
import type {
  StockeventsCashMappingRow,
  StockeventsCashSyncEntryRow,
} from '../../db/repositories/stockevents-cash-mappings'
import type { StockeventsSymbolMappingRow } from '../../db/repositories/stockevents-symbol-mappings'
import type { SubscriptionRow } from '../../db/repositories/subscriptions'
import type { InvestmentTradeDetailRow, TransactionRow } from '../../db/repositories/transactions'
import type { UserSettingsRow } from '../../db/repositories/user-settings'
import type { SnapshotBalanceRow, WealthSnapshotRow } from '../../db/repositories/wealth'

/**
 * Every private collection, with its nested relation already attached in the
 * shape the bootstrap serves. The export maps `tradeDetail` to its own
 * `operation` projection; nothing else about the rows differs between reads.
 */
export interface PrivateDataset {
  settings: UserSettingsRow | null
  accounts: AccountRow[]
  categories: CategoryRow[]
  transactions: Array<TransactionRow & { tradeDetail?: InvestmentTradeDetailRow }>
  subscriptions: SubscriptionRow[]
  recurringRules: RecurringRuleRow[]
  pendingMovements: PendingMovementRow[]
  budgetEntries: BudgetEntryRow[]
  goals: GoalRow[]
  wealthSnapshots: Array<WealthSnapshotRow & { balances: SnapshotBalanceRow[] }>
  contributions: Array<ContributionRow & { allocations: ContributionAllocationRow[] }>
  userInstruments: UserInstrumentRow[]
  twrLiquidityAccounts: TwrLiquidityAccountRow[]
  stockeventsSymbolMappings: StockeventsSymbolMappingRow[]
  stockeventsCashMappings: StockeventsCashMappingRow[]
  stockeventsCashSyncEntries: StockeventsCashSyncEntryRow[]
}

export function readPrivateDataset(
  userId: string,
  options: { year?: number } = {},
): Effect.Effect<PrivateDataset, DatabaseError, Database> {
  return Effect.gen(function* () {
    const [
      settings,
      accounts,
      categories,
      transactions,
      subscriptions,
      recurringRules,
      pendingMovements,
      budgetEntries,
      goals,
      wealthSnapshots,
      contributions,
      userInstruments,
      twrLiquidityAccounts,
      stockeventsSymbolMappings,
      stockeventsCashMappings,
      stockeventsCashSyncEntries,
    ] = yield* Effect.all(
      [
        userSettingsRepository.get(userId),
        accountsRepository.listByUser(userId),
        accountsRepository.listCategoriesByUser(userId),
        transactionsRepository.listByUser(userId),
        subscriptionsRepository.listByUser(userId),
        recurringRulesRepository.listByUser(userId),
        pendingMovementsRepository.listByUser(userId),
        budgetEntriesRepository.listByUser(userId),
        goalsRepository.listByUser(userId),
        wealthRepository.listByUser(userId),
        contributionsRepository.listByUser(userId),
        marketRepository.listUserInstrumentsByUser(userId),
        accountsRepository.listTwrLiquidityAccountsByUser(userId),
        stockeventsSymbolMappingsRepository.listByUser(userId),
        stockeventsCashMappingsRepository.listMappingsByUser(userId),
        stockeventsCashMappingsRepository.listSyncEntriesByUser(userId),
      ] as const,
      { concurrency: 'unbounded' },
    )

    const year = options.year
    const filteredTransactions =
      year === undefined
        ? transactions
        : transactions.filter((tx) => tx.date.startsWith(`${year}-`))
    const filteredBudgetEntries =
      year === undefined ? budgetEntries : budgetEntries.filter((entry) => entry.year === year)
    const filteredWealthSnapshots =
      year === undefined
        ? wealthSnapshots
        : wealthSnapshots.filter((snapshot) => snapshot.year === year)

    // Relations are requested only for the rows that survive the year filter:
    // no query ever asks for another year's snapshots or movements. One batch
    // per relation keeps the cost independent of the number of parent rows.
    const [balancesBySnapshot, allocationsByContribution, tradeDetailsByTransaction] =
      yield* Effect.all(
        [
          wealthRepository.listBalancesBySnapshots(
            userId,
            filteredWealthSnapshots.map((snapshot) => snapshot.id),
          ),
          contributionsRepository.listAllocationsByContributions(
            userId,
            contributions.map((contribution) => contribution.id),
          ),
          transactionsRepository.listTradeDetailsByTransactions(
            userId,
            filteredTransactions.map((transaction) => transaction.id),
          ),
        ] as const,
        { concurrency: 'unbounded' },
      )

    return {
      settings: settings ?? null,
      accounts,
      categories,
      transactions: filteredTransactions.map((transaction) => ({
        ...transaction,
        tradeDetail: tradeDetailsByTransaction.get(transaction.id),
      })),
      subscriptions,
      recurringRules,
      pendingMovements,
      budgetEntries: filteredBudgetEntries,
      goals,
      wealthSnapshots: filteredWealthSnapshots.map((snapshot) => ({
        ...snapshot,
        balances: balancesBySnapshot.get(snapshot.id) ?? [],
      })),
      contributions: contributions.map((contribution) => ({
        ...contribution,
        allocations: allocationsByContribution.get(contribution.id) ?? [],
      })),
      userInstruments,
      twrLiquidityAccounts,
      stockeventsSymbolMappings,
      stockeventsCashMappings,
      stockeventsCashSyncEntries,
    }
  })
}

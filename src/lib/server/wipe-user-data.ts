/**
 * Deletes every private v2 row of one user, children before parents, so the
 * caller can re-seed (`POST /api/state/reset`) or restore a backup
 * (`POST /api/data/import?mode=replace`) inside the same transaction.
 *
 * `integration_credentials` and the Bitvavo connection are left untouched:
 * wiping data should not silently revoke a configured integration.
 */

import { Effect } from 'effect'
import * as accountsRepository from '../../db/repositories/accounts'
import * as transactionsRepository from '../../db/repositories/transactions'
import * as subscriptionsRepository from '../../db/repositories/subscriptions'
import * as recurringRulesRepository from '../../db/repositories/recurring-rules'
import * as pendingMovementsRepository from '../../db/repositories/pending-movements'
import * as budgetEntriesRepository from '../../db/repositories/budget-entries'
import * as goalsRepository from '../../db/repositories/goals'
import * as wealthRepository from '../../db/repositories/wealth'
import * as contributionsRepository from '../../db/repositories/contributions'
import * as marketRepository from '../../db/repositories/market'
import * as stockeventsSymbolMappingsRepository from '../../db/repositories/stockevents-symbol-mappings'
import * as stockeventsCashMappingsRepository from '../../db/repositories/stockevents-cash-mappings'
import * as userSettingsRepository from '../../db/repositories/user-settings'
import type { Database, DatabaseError } from '../../db/database'

export function wipeUserData(userId: string): Effect.Effect<void, DatabaseError, Database> {
  return Effect.gen(function* () {
    const [
      contributions,
      wealthSnapshots,
      userInstruments,
      stockeventsSymbolMappings,
      stockeventsCashMappings,
      stockeventsCashSyncEntries,
      pendingMovements,
      recurringRules,
      subscriptions,
      budgetEntries,
      goals,
      transactions,
      twrLiquidityAccounts,
      categories,
      accounts,
    ] = yield* Effect.all(
      [
        contributionsRepository.listByUser(userId),
        wealthRepository.listByUser(userId),
        marketRepository.listUserInstrumentsByUser(userId),
        stockeventsSymbolMappingsRepository.listByUser(userId),
        stockeventsCashMappingsRepository.listMappingsByUser(userId),
        stockeventsCashMappingsRepository.listSyncEntriesByUser(userId),
        pendingMovementsRepository.listByUser(userId),
        recurringRulesRepository.listByUser(userId),
        subscriptionsRepository.listByUser(userId),
        budgetEntriesRepository.listByUser(userId),
        goalsRepository.listByUser(userId),
        transactionsRepository.listByUser(userId),
        accountsRepository.listTwrLiquidityAccountsByUser(userId),
        accountsRepository.listCategoriesByUser(userId),
        accountsRepository.listByUser(userId),
      ] as const,
      { concurrency: 'unbounded' },
    )

    for (const contribution of contributions) {
      const allocations = yield* contributionsRepository.listAllocationsByContribution(
        userId,
        contribution.id,
      )
      for (const allocation of allocations) {
        yield* contributionsRepository.removeAllocation(userId, allocation.id)
      }
      yield* contributionsRepository.remove(userId, contribution.id)
    }
    for (const snapshot of wealthSnapshots) {
      const balances = yield* wealthRepository.listBalancesBySnapshot(userId, snapshot.id)
      for (const balance of balances) {
        yield* wealthRepository.removeBalance(userId, balance.id)
      }
      yield* wealthRepository.remove(userId, snapshot.id)
    }
    for (const userInstrument of userInstruments) {
      yield* marketRepository.removeUserInstrument(userId, userInstrument.id)
    }
    for (const mapping of stockeventsSymbolMappings) {
      yield* stockeventsSymbolMappingsRepository.remove(userId, mapping.id)
    }
    for (const mapping of stockeventsCashMappings) {
      yield* stockeventsCashMappingsRepository.removeMapping(userId, mapping.id)
    }
    for (const entry of stockeventsCashSyncEntries) {
      yield* stockeventsCashMappingsRepository.removeSyncEntry(userId, entry.id)
    }
    for (const pendingMovement of pendingMovements) {
      yield* pendingMovementsRepository.remove(userId, pendingMovement.id)
    }
    for (const rule of recurringRules) {
      yield* recurringRulesRepository.remove(userId, rule.id)
    }
    for (const subscription of subscriptions) {
      yield* subscriptionsRepository.remove(userId, subscription.id)
    }
    for (const entry of budgetEntries) {
      yield* budgetEntriesRepository.remove(userId, entry.id)
    }
    for (const goal of goals) {
      yield* goalsRepository.remove(userId, goal.id)
    }
    for (const transaction of transactions) {
      yield* transactionsRepository.remove(userId, transaction.id)
    }
    for (const twrAccount of twrLiquidityAccounts) {
      yield* accountsRepository.removeTwrLiquidityAccount(userId, twrAccount.id)
    }
    for (const account of accounts) {
      yield* accountsRepository.remove(userId, account.id)
    }
    for (const category of categories) {
      yield* accountsRepository.removeCategory(userId, category.id)
    }

    yield* userSettingsRepository.remove(userId)
  })
}

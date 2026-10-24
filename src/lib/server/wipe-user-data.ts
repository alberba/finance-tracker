/**
 * Deletes every private v2 row of one user, children before parents, so the
 * caller can re-seed (`POST /api/state/reset`) or restore a backup
 * (`POST /api/data/import?mode=replace`) inside the same transaction.
 *
 * `integration_credentials` and the Bitvavo connection are left untouched:
 * wiping data should not silently revoke a configured integration.
 */

import * as accountsRepository from '../../db/repositories/accounts'
import * as transactionsRepository from '../../db/repositories/transactions'
import * as subscriptionsRepository from '../../db/repositories/subscriptions'
import * as recurringRulesRepository from '../../db/repositories/recurring-rules'
import * as pendingMovementsRepository from '../../db/repositories/pending-movements'
import * as budgetEntriesRepository from '../../db/repositories/budget-entries'
import * as goalsRepository from '../../db/repositories/goals'
import { runWithDb } from '../../db/database'
import * as wealthRepository from '../../db/repositories/wealth'
import * as contributionsRepository from '../../db/repositories/contributions'
import * as marketRepository from '../../db/repositories/market'
import * as stockeventsSymbolMappingsRepository from '../../db/repositories/stockevents-symbol-mappings'
import * as stockeventsCashMappingsRepository from '../../db/repositories/stockevents-cash-mappings'
import * as userSettingsRepository from '../../db/repositories/user-settings'
import type { Db } from '../../db/repositories/shared'

export async function wipeUserData(db: Db, userId: string): Promise<void> {
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
  ] = await Promise.all([
    contributionsRepository.listByUser(db, userId),
    wealthRepository.listByUser(db, userId),
    runWithDb(db, marketRepository.listUserInstrumentsByUser(userId)),
    runWithDb(db, stockeventsSymbolMappingsRepository.listByUser(userId)),
    runWithDb(db, stockeventsCashMappingsRepository.listMappingsByUser(userId)),
    runWithDb(db, stockeventsCashMappingsRepository.listSyncEntriesByUser(userId)),
    runWithDb(db, pendingMovementsRepository.listByUser(userId)),
    runWithDb(db, recurringRulesRepository.listByUser(userId)),
    runWithDb(db, subscriptionsRepository.listByUser(userId)),
    runWithDb(db, budgetEntriesRepository.listByUser(userId)),
    runWithDb(db, goalsRepository.listByUser(userId)),
    transactionsRepository.listByUser(db, userId),
    runWithDb(db, accountsRepository.listTwrLiquidityAccountsByUser(userId)),
    runWithDb(db, accountsRepository.listCategoriesByUser(userId)),
    runWithDb(db, accountsRepository.listByUser(userId)),
  ])

  for (const contribution of contributions) {
    const allocations = await contributionsRepository.listAllocationsByContribution(
      db,
      userId,
      contribution.id,
    )
    for (const allocation of allocations) {
      await contributionsRepository.removeAllocation(db, userId, allocation.id)
    }
    await contributionsRepository.remove(db, userId, contribution.id)
  }
  for (const snapshot of wealthSnapshots) {
    const balances = await wealthRepository.listBalancesBySnapshot(db, userId, snapshot.id)
    for (const balance of balances) {
      await wealthRepository.removeBalance(db, userId, balance.id)
    }
    await wealthRepository.remove(db, userId, snapshot.id)
  }
  for (const userInstrument of userInstruments) {
    await runWithDb(db, marketRepository.removeUserInstrument(userId, userInstrument.id))
  }
  for (const mapping of stockeventsSymbolMappings) {
    await runWithDb(db, stockeventsSymbolMappingsRepository.remove(userId, mapping.id))
  }
  for (const mapping of stockeventsCashMappings) {
    await runWithDb(db, stockeventsCashMappingsRepository.removeMapping(userId, mapping.id))
  }
  for (const entry of stockeventsCashSyncEntries) {
    await runWithDb(db, stockeventsCashMappingsRepository.removeSyncEntry(userId, entry.id))
  }
  for (const pendingMovement of pendingMovements) {
    await runWithDb(db, pendingMovementsRepository.remove(userId, pendingMovement.id))
  }
  for (const rule of recurringRules) {
    await runWithDb(db, recurringRulesRepository.remove(userId, rule.id))
  }
  for (const subscription of subscriptions) {
    await runWithDb(db, subscriptionsRepository.remove(userId, subscription.id))
  }
  for (const entry of budgetEntries) {
    await runWithDb(db, budgetEntriesRepository.remove(userId, entry.id))
  }
  for (const goal of goals) {
    await runWithDb(db, goalsRepository.remove(userId, goal.id))
  }
  for (const transaction of transactions) {
    await transactionsRepository.remove(db, userId, transaction.id)
  }
  for (const twrAccount of twrLiquidityAccounts) {
    await runWithDb(db, accountsRepository.removeTwrLiquidityAccount(userId, twrAccount.id))
  }
  for (const account of accounts) {
    await runWithDb(db, accountsRepository.remove(userId, account.id))
  }
  for (const category of categories) {
    await runWithDb(db, accountsRepository.removeCategory(userId, category.id))
  }

  await runWithDb(db, userSettingsRepository.remove(userId))
  // Keep the cursor monotonic: clients must accept the restored dataset as newer.
}

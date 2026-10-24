/**
 * Assembles the full private dataset a client needs to initialize its local
 * cache. Extracted from `GET /api/bootstrap` so the round-trip test harness
 * (`tests/integration/d1-v2/round-trip/`) can exercise the *same* assembly the
 * route serves without going through HTTP — the read half of
 * store → command → repository → bootstrap → projection → normalizeState.
 *
 * Pure read: it never writes, mirroring the route's contract.
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
import * as userSettingsRepository from '../../db/repositories/user-settings'
import * as syncRepository from '../../db/repositories/sync'
import * as stockeventsSymbolMappingsRepository from '../../db/repositories/stockevents-symbol-mappings'
import * as stockeventsCashMappingsRepository from '../../db/repositories/stockevents-cash-mappings'

export function buildBootstrapPayload(userId: string, year?: number) {
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
      revisionRow,
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
        syncRepository.getRevision(userId),
      ] as const,
      { concurrency: 'unbounded' },
    )

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

    const wealthSnapshotsWithBalances = filteredWealthSnapshots.map((snapshot) => ({
      ...snapshot,
      balances: balancesBySnapshot.get(snapshot.id) ?? [],
    }))

    const contributionsWithAllocations = contributions.map((contribution) => ({
      ...contribution,
      allocations: allocationsByContribution.get(contribution.id) ?? [],
    }))

    const transactionsWithTradeDetails = filteredTransactions.map((transaction) => ({
      ...transaction,
      tradeDetail: tradeDetailsByTransaction.get(transaction.id),
    }))

    const instrumentIds = userInstruments.map((userInstrument) => userInstrument.instrumentId)
    const [instrumentRows, quotesByInstrument] = yield* Effect.all(
      [
        marketRepository.listInstrumentsByIds(instrumentIds),
        marketRepository.listQuotesByInstruments(instrumentIds),
      ] as const,
      { concurrency: 'unbounded' },
    )
    const instrumentsById = new Map(instrumentRows.map((instrument) => [instrument.id, instrument]))
    const instruments = userInstruments
      .map((userInstrument) => {
        const instrument = instrumentsById.get(userInstrument.instrumentId)
        if (!instrument) return null
        const quotes = quotesByInstrument.get(instrument.id) ?? []
        return { ...instrument, userInstrument, quotes }
      })
      .filter((instrument) => instrument !== null)

    return {
      year: year ?? null,
      revision: revisionRow?.revision ?? 0,
      settings: settings ?? null,
      accounts,
      categories,
      transactions: transactionsWithTradeDetails,
      subscriptions,
      recurringRules,
      pendingMovements,
      budgetEntries: filteredBudgetEntries,
      goals,
      wealthSnapshots: wealthSnapshotsWithBalances,
      contributions: contributionsWithAllocations,
      userInstruments,
      instruments,
      twrLiquidityAccounts,
      stockeventsSymbolMappings,
      stockeventsCashMappings,
      stockeventsCashSyncEntries,
    }
  })
}

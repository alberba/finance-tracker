/**
 * Assembles the full private dataset a client needs to initialize its local
 * cache. Extracted from `GET /api/bootstrap` so the round-trip test harness
 * (`tests/integration/d1-v2/round-trip/`) can exercise the *same* assembly the
 * route serves without going through HTTP — the read half of
 * store → command → repository → bootstrap → projection → normalizeState.
 *
 * Pure read: it never writes, mirroring the route's contract.
 */

import type { Db } from "../../db/client";
import * as accountsRepository from "../../db/repositories/accounts";
import * as transactionsRepository from "../../db/repositories/transactions";
import * as subscriptionsRepository from "../../db/repositories/subscriptions";
import * as recurringRulesRepository from "../../db/repositories/recurring-rules";
import * as pendingMovementsRepository from "../../db/repositories/pending-movements";
import * as budgetEntriesRepository from "../../db/repositories/budget-entries";
import * as goalsRepository from "../../db/repositories/goals";
import * as wealthRepository from "../../db/repositories/wealth";
import * as contributionsRepository from "../../db/repositories/contributions";
import * as marketRepository from "../../db/repositories/market";
import * as userSettingsRepository from "../../db/repositories/user-settings";
import * as syncRepository from "../../db/repositories/sync";
import * as stockeventsSymbolMappingsRepository from "../../db/repositories/stockevents-symbol-mappings";

export async function buildBootstrapPayload(db: Db, userId: string, year?: number) {
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
    revisionRow,
  ] = await Promise.all([
    userSettingsRepository.get(db, userId),
    accountsRepository.listByUser(db, userId),
    accountsRepository.listCategoriesByUser(db, userId),
    transactionsRepository.listByUser(db, userId),
    subscriptionsRepository.listByUser(db, userId),
    recurringRulesRepository.listByUser(db, userId),
    pendingMovementsRepository.listByUser(db, userId),
    budgetEntriesRepository.listByUser(db, userId),
    goalsRepository.listByUser(db, userId),
    wealthRepository.listByUser(db, userId),
    contributionsRepository.listByUser(db, userId),
    marketRepository.listUserInstrumentsByUser(db, userId),
    accountsRepository.listTwrLiquidityAccountsByUser(db, userId),
    stockeventsSymbolMappingsRepository.listByUser(db, userId),
    syncRepository.getRevision(db, userId),
  ]);

  const filteredTransactions =
    year === undefined ? transactions : transactions.filter((tx) => tx.date.startsWith(`${year}-`));
  const filteredBudgetEntries =
    year === undefined ? budgetEntries : budgetEntries.filter((entry) => entry.year === year);
  const filteredWealthSnapshots =
    year === undefined ? wealthSnapshots : wealthSnapshots.filter((snapshot) => snapshot.year === year);

  const wealthSnapshotsWithBalances = await Promise.all(
    filteredWealthSnapshots.map(async (snapshot) => ({
      ...snapshot,
      balances: await wealthRepository.listBalancesBySnapshot(db, userId, snapshot.id),
    })),
  );

  const contributionsWithAllocations = await Promise.all(
    contributions.map(async (contribution) => ({
      ...contribution,
      allocations: await contributionsRepository.listAllocationsByContribution(db, userId, contribution.id),
    })),
  );

  const transactionsWithTradeDetails = await Promise.all(
    filteredTransactions.map(async (transaction) => ({
      ...transaction,
      tradeDetail: await transactionsRepository.getTradeDetailByTransaction(db, userId, transaction.id),
    })),
  );

  const instruments = await Promise.all(
    userInstruments.map(async (userInstrument) => {
      const instrument = await marketRepository.getInstrument(db, userInstrument.instrumentId);
      if (!instrument) return null;
      const quotes = await marketRepository.listQuotesByInstrument(db, instrument.id);
      return { ...instrument, userInstrument, quotes };
    }),
  );

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
    instruments: instruments.filter((instrument) => instrument !== null),
    twrLiquidityAccounts,
    stockeventsSymbolMappings,
  };
}

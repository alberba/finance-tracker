/**
 * Recomputes the same `ParitySnapshot` shape as `computeV1Parity()`
 * (`scripts/lib/migration-parity.ts`), but reading it back from v2 through
 * the WP6 repository layer for a given user + year. Used by
 * `scripts/validate-migration-parity.ts` to diff against the v1 source
 * independently of whatever the migration run itself reported.
 */

import {
  accountsRepository,
  budgetEntriesRepository,
  contributionsRepository,
  goalsRepository,
  integrationCredentialsRepository,
  marketRepository,
  pendingMovementsRepository,
  recurringRulesRepository,
  stockeventsSymbolMappingsRepository,
  subscriptionsRepository,
  transactionsRepository,
  wealthRepository,
} from "../../src/db/repositories";
import type { Db } from "../../src/db/repositories/shared";
import type { DataEncryptionEnv } from "../../src/lib/server/crypto/data-encryption";
import { TRANSACTION_TYPES, type BudgetType, type GoalKey, type TransactionType } from "../../src/scripts/types";
import type { MigrationCollection, ParitySnapshot } from "./migration-types";

function round2(value: number): number {
  return Math.round((value + Number.EPSILON) * 100) / 100;
}

export async function computeV2Parity(
  db: Db,
  userId: string,
  year: number,
  dataEncryptionEnv?: DataEncryptionEnv,
): Promise<ParitySnapshot> {
  const [
    accounts,
    twrLiquidityAccounts,
    categories,
    instruments,
    userInstruments,
    transactions,
    subscriptions,
    recurringRules,
    pendingMovements,
    budgetEntries,
    goals,
    wealthSnapshots,
    contributions,
    stockeventsSymbolMappings,
  ] = await Promise.all([
    accountsRepository.listByUser(db, userId),
    accountsRepository.listTwrLiquidityAccountsByUser(db, userId),
    accountsRepository.listCategoriesByUser(db, userId),
    marketRepository.listInstruments(db),
    marketRepository.listUserInstrumentsByUser(db, userId),
    transactionsRepository.listByUser(db, userId),
    subscriptionsRepository.listByUser(db, userId),
    recurringRulesRepository.listByUser(db, userId),
    pendingMovementsRepository.listByUser(db, userId),
    budgetEntriesRepository.listByUser(db, userId),
    goalsRepository.listByUser(db, userId),
    wealthRepository.listByUser(db, userId),
    contributionsRepository.listByUser(db, userId),
    stockeventsSymbolMappingsRepository.listByUser(db, userId),
  ]);

  const accountKindById = new Map(accounts.map((a) => [a.id, a.kind]));

  let investmentTradeDetailCount = 0;
  const monthlyTotals = {} as Record<TransactionType, number[]>;
  for (const type of TRANSACTION_TYPES) {
    monthlyTotals[type] = Array.from({ length: 12 }, () => 0);
  }
  for (const tx of transactions) {
    const match = /^(\d{4})-(\d{2})-\d{2}$/.exec(tx.date);
    if (!match || Number(match[1]) !== year) {
      continue;
    }
    const month = Number(match[2]) - 1;
    if (month < 0 || month > 11) {
      continue;
    }
    monthlyTotals[tx.type as TransactionType][month] = round2(monthlyTotals[tx.type as TransactionType][month] + tx.amount);
    if (tx.type === "investment") {
      const detail = await transactionsRepository.getTradeDetailByTransaction(db, userId, tx.id);
      if (detail) {
        investmentTradeDetailCount += 1;
      }
    }
  }

  const wealthSnapshotsForYear = wealthSnapshots.filter((s) => s.year === year);
  const wealthPerSnapshot: ParitySnapshot["wealthPerSnapshot"] = {};
  let snapshotBalanceCount = 0;
  let marketQuoteCount = 0;
  for (const snapshot of wealthSnapshotsForYear) {
    const balances = await wealthRepository.listBalancesBySnapshot(db, userId, snapshot.id);
    snapshotBalanceCount += balances.length;
    let acc = 0;
    let inv = 0;
    let liab = 0;
    for (const balance of balances) {
      const kind = balance.accountId ? accountKindById.get(balance.accountId) : undefined;
      if (kind === "cash") acc = round2(acc + balance.balance);
      else if (kind === "investment") inv = round2(inv + balance.balance);
      else if (kind === "liability") liab = round2(liab + balance.balance);
    }
    wealthPerSnapshot[`${year}-${snapshot.month}`] = { accounts: acc, investments: inv, liabilities: liab, net: round2(acc + inv - liab) };
  }
  for (const instrument of instruments) {
    const quotes = await marketRepository.listQuotesByInstrument(db, instrument.id);
    marketQuoteCount += quotes.length;
  }

  const categoryById = new Map(categories.map((c) => [c.id, c]));
  const budgetTotals = {} as Record<BudgetType, Record<string, number>>;
  (["income", "expense", "investment"] as BudgetType[]).forEach((type) => {
    budgetTotals[type] = {};
  });
  for (const entry of budgetEntries) {
    if (entry.year !== year) {
      continue;
    }
    const category = categoryById.get(entry.categoryId);
    if (!category) {
      continue;
    }
    const type = category.kind as BudgetType;
    budgetTotals[type][category.name] = round2((budgetTotals[type][category.name] || 0) + entry.amount);
  }

  const goalTargets = {} as Record<GoalKey, number>;
  for (const goal of goals) {
    goalTargets[goal.key as GoalKey] = goal.targetAmount;
  }

  let contributionAllocationCount = 0;
  for (const contribution of contributions) {
    const allocations = await contributionsRepository.listAllocationsByContribution(db, userId, contribution.id);
    contributionAllocationCount += allocations.length;
  }

  const integrationCredentials = dataEncryptionEnv
    ? await integrationCredentialsRepository.listByUser(db, userId, dataEncryptionEnv)
    : [];

  const counts: Record<MigrationCollection, number> = {
    users: 1,
    accounts: accounts.length,
    twrLiquidityAccounts: twrLiquidityAccounts.length,
    categories: categories.length,
    marketInstruments: instruments.length,
    marketQuotes: marketQuoteCount,
    userInstruments: userInstruments.length,
    transactions: transactions.length,
    investmentTradeDetails: investmentTradeDetailCount,
    subscriptions: subscriptions.length,
    recurringRules: recurringRules.length,
    pendingMovements: pendingMovements.length,
    budgetEntries: budgetEntries.filter((e) => e.year === year).length,
    goals: goals.length,
    wealthSnapshots: wealthSnapshotsForYear.length,
    snapshotBalances: snapshotBalanceCount,
    contributions: contributions.length,
    contributionAllocations: contributionAllocationCount,
    integrationCredentials: integrationCredentials.filter((c) => c.provider === "stockevents").length,
    stockeventsSymbolMappings: stockeventsSymbolMappings.length,
  };

  return { counts, monthlyTotals, wealthPerSnapshot, budgetTotals, goalTargets };
}

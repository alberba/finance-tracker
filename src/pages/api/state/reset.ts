/**
 * `POST /api/state/reset` (WP4) — new v2 semantics per the work-package
 * spec: this used to reset the whole `x-finance-namespace`-selected
 * `app_state` blob (`src/lib/server/d1-state.ts`, still used by the legacy
 * `src/pages/api/state.ts` until cutover). Now it wipes only the
 * authenticated user's own private rows across every v2 table (per-user
 * "empezar de cero", not a namespace-wide blob reset) and re-seeds the
 * same defaults as `POST /api/state/initialize`.
 *
 * `integration_credentials` is deliberately left untouched (WP12 owns that
 * table's lifecycle; a reset should not silently revoke a configured
 * integration).
 */

import type { APIRoute } from "astro";
import { getDb } from "../../../db/client";
import * as accountsRepository from "../../../db/repositories/accounts";
import * as transactionsRepository from "../../../db/repositories/transactions";
import * as subscriptionsRepository from "../../../db/repositories/subscriptions";
import * as recurringRulesRepository from "../../../db/repositories/recurring-rules";
import * as pendingMovementsRepository from "../../../db/repositories/pending-movements";
import * as budgetEntriesRepository from "../../../db/repositories/budget-entries";
import * as goalsRepository from "../../../db/repositories/goals";
import * as wealthRepository from "../../../db/repositories/wealth";
import * as contributionsRepository from "../../../db/repositories/contributions";
import * as marketRepository from "../../../db/repositories/market";
import * as stockeventsSymbolMappingsRepository from "../../../db/repositories/stockevents-symbol-mappings";
import * as userSettingsRepository from "../../../db/repositories/user-settings";
import * as syncRepository from "../../../db/repositories/sync";
import { jsonResponse, requirePrincipal, withApiErrorHandling } from "../../../lib/server/api-auth";
import { runInTransaction, type Db } from "../../../db/repositories/shared";

async function wipeUserData(db: Db, userId: string): Promise<void> {
  const [
    contributions,
    wealthSnapshots,
    userInstruments,
    stockeventsSymbolMappings,
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
    marketRepository.listUserInstrumentsByUser(db, userId),
    stockeventsSymbolMappingsRepository.listByUser(db, userId),
    pendingMovementsRepository.listByUser(db, userId),
    recurringRulesRepository.listByUser(db, userId),
    subscriptionsRepository.listByUser(db, userId),
    budgetEntriesRepository.listByUser(db, userId),
    goalsRepository.listByUser(db, userId),
    transactionsRepository.listByUser(db, userId),
    accountsRepository.listTwrLiquidityAccountsByUser(db, userId),
    accountsRepository.listCategoriesByUser(db, userId),
    accountsRepository.listByUser(db, userId),
  ]);

  for (const contribution of contributions) {
    const allocations = await contributionsRepository.listAllocationsByContribution(
      db,
      userId,
      contribution.id,
    );
    for (const allocation of allocations) {
      await contributionsRepository.removeAllocation(db, userId, allocation.id);
    }
    await contributionsRepository.remove(db, userId, contribution.id);
  }
  for (const snapshot of wealthSnapshots) {
    const balances = await wealthRepository.listBalancesBySnapshot(db, userId, snapshot.id);
    for (const balance of balances) {
      await wealthRepository.removeBalance(db, userId, balance.id);
    }
    await wealthRepository.remove(db, userId, snapshot.id);
  }
  for (const userInstrument of userInstruments) {
    await marketRepository.removeUserInstrument(db, userId, userInstrument.id);
  }
  for (const mapping of stockeventsSymbolMappings) {
    await stockeventsSymbolMappingsRepository.remove(db, userId, mapping.id);
  }
  for (const pendingMovement of pendingMovements) {
    await pendingMovementsRepository.remove(db, userId, pendingMovement.id);
  }
  for (const rule of recurringRules) {
    await recurringRulesRepository.remove(db, userId, rule.id);
  }
  for (const subscription of subscriptions) {
    await subscriptionsRepository.remove(db, userId, subscription.id);
  }
  for (const entry of budgetEntries) {
    await budgetEntriesRepository.remove(db, userId, entry.id);
  }
  for (const goal of goals) {
    await goalsRepository.remove(db, userId, goal.id);
  }
  for (const transaction of transactions) {
    await transactionsRepository.remove(db, userId, transaction.id);
  }
  for (const twrAccount of twrLiquidityAccounts) {
    await accountsRepository.removeTwrLiquidityAccount(db, userId, twrAccount.id);
  }
  for (const account of accounts) {
    await accountsRepository.remove(db, userId, account.id);
  }
  for (const category of categories) {
    await accountsRepository.removeCategory(db, userId, category.id);
  }

  await userSettingsRepository.remove(db, userId);
  await syncRepository.removeRevision(db, userId);
}

const DEFAULT_CATEGORIES: Array<{ name: string; kind: string; sortOrder: number }> = [
  { name: "Ingresos", kind: "income", sortOrder: 0 },
  { name: "Gastos generales", kind: "expense", sortOrder: 0 },
];

export const POST: APIRoute = async ({ locals }) =>
  withApiErrorHandling(async () => {
    const principal = requirePrincipal(locals);
    const db = getDb(locals);
    const userId = principal.userId;

    const result = await runInTransaction(db, async (tx) => {
      await wipeUserData(tx, userId);
      const settings = await userSettingsRepository.create(tx, userId, { currency: "EUR" });
      const categories = await accountsRepository.bulkInsertCategories(tx, userId, DEFAULT_CATEGORIES);
      await syncRepository.ensureRevision(tx, userId);
      return { settings, categories };
    });

    return jsonResponse({ ok: true, ...result }, 200);
  });

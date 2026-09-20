/**
 * `GET /api/data/export` (WP4) — pure read, never writes. Dumps the
 * authenticated user's full private dataset as JSON, for backup or the
 * WP11 rollback path. `integration_credentials` is unconditionally
 * excluded — per the plan, credentials are never exported, encrypted or
 * not (WP12 owns that table; another agent owns its files this wave).
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
import { jsonResponse, requirePrincipal, withApiErrorHandling } from "../../../lib/server/api-auth";

export const GET: APIRoute = async ({ locals }) =>
  withApiErrorHandling("/api/data/export", async () => {
    const principal = requirePrincipal(locals);
    const db = getDb(locals);
    const userId = principal.userId;

    const [
      settings,
      accounts,
      categories,
      twrLiquidityAccounts,
      transactions,
      subscriptions,
      recurringRules,
      pendingMovements,
      budgetEntries,
      goals,
      wealthSnapshots,
      contributions,
      userInstruments,
      stockeventsSymbolMappings,
    ] = await Promise.all([
      userSettingsRepository.get(db, userId),
      accountsRepository.listByUser(db, userId),
      accountsRepository.listCategoriesByUser(db, userId),
      accountsRepository.listTwrLiquidityAccountsByUser(db, userId),
      transactionsRepository.listByUser(db, userId),
      subscriptionsRepository.listByUser(db, userId),
      recurringRulesRepository.listByUser(db, userId),
      pendingMovementsRepository.listByUser(db, userId),
      budgetEntriesRepository.listByUser(db, userId),
      goalsRepository.listByUser(db, userId),
      wealthRepository.listByUser(db, userId),
      contributionsRepository.listByUser(db, userId),
      marketRepository.listUserInstrumentsByUser(db, userId),
      stockeventsSymbolMappingsRepository.listByUser(db, userId),
    ]);

    const wealthSnapshotsWithBalances = await Promise.all(
      wealthSnapshots.map(async (snapshot) => ({
        ...snapshot,
        balances: await wealthRepository.listBalancesBySnapshot(db, userId, snapshot.id),
      })),
    );

    const contributionsWithAllocations = await Promise.all(
      contributions.map(async (contribution) => ({
        ...contribution,
        allocations: await contributionsRepository.listAllocationsByContribution(
          db,
          userId,
          contribution.id,
        ),
      })),
    );

    return jsonResponse(
      {
        exportedAt: new Date().toISOString(),
        userId,
        settings: settings ?? null,
        accounts,
        categories,
        twrLiquidityAccounts,
        transactions,
        subscriptions,
        recurringRules,
        pendingMovements,
        budgetEntries,
        goals,
        wealthSnapshots: wealthSnapshotsWithBalances,
        contributions: contributionsWithAllocations,
        userInstruments,
        stockeventsSymbolMappings,
      },
      200,
    );
  });

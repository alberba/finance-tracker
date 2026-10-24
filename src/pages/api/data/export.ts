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
import { runWithDb } from "../../../db/database";
import * as wealthRepository from "../../../db/repositories/wealth";
import * as contributionsRepository from "../../../db/repositories/contributions";
import * as marketRepository from "../../../db/repositories/market";
import * as stockeventsSymbolMappingsRepository from "../../../db/repositories/stockevents-symbol-mappings";
import * as stockeventsCashMappingsRepository from "../../../db/repositories/stockevents-cash-mappings";
import * as userSettingsRepository from "../../../db/repositories/user-settings";
import { DATA_EXPORT_FORMAT } from "../../../lib/data-export-format";
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
      stockeventsCashMappings,
      stockeventsCashSyncEntries,
    ] = await Promise.all([
      runWithDb(db, userSettingsRepository.get(userId)),
      runWithDb(db, accountsRepository.listByUser(userId)),
      runWithDb(db, accountsRepository.listCategoriesByUser(userId)),
      runWithDb(db, accountsRepository.listTwrLiquidityAccountsByUser(userId)),
      transactionsRepository.listByUser(db, userId),
      runWithDb(db, subscriptionsRepository.listByUser(userId)),
      runWithDb(db, recurringRulesRepository.listByUser(userId)),
      runWithDb(db, pendingMovementsRepository.listByUser(userId)),
      runWithDb(db, budgetEntriesRepository.listByUser(userId)),
      runWithDb(db, goalsRepository.listByUser(userId)),
      wealthRepository.listByUser(db, userId),
      contributionsRepository.listByUser(db, userId),
      runWithDb(db, marketRepository.listUserInstrumentsByUser(userId)),
      runWithDb(db, stockeventsSymbolMappingsRepository.listByUser(userId)),
      runWithDb(db, stockeventsCashMappingsRepository.listMappingsByUser(userId)),
      runWithDb(db, stockeventsCashMappingsRepository.listSyncEntriesByUser(userId)),
    ]);

    const tradeDetails = await transactionsRepository.listTradeDetailsByTransactions(
      db,
      userId,
      transactions.map((transaction) => transaction.id),
    );
    // The operation travels inside its movement (ADR 0002), in the same shape
    // the import hands back to `transactionsRepository.create`.
    const transactionsWithOperations = transactions.map((transaction) => {
      const detail = tradeDetails.get(transaction.id);
      return {
        ...transaction,
        operation: detail
          ? {
              instrumentId: detail.instrumentId,
              symbol: detail.symbol,
              side: detail.side,
              units: Number(detail.quantity),
              unitPrice: detail.price,
              fee: detail.fee,
            }
          : null,
      };
    });

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
        format: DATA_EXPORT_FORMAT,
        exportedAt: new Date().toISOString(),
        userId,
        settings: settings ?? null,
        accounts,
        categories,
        twrLiquidityAccounts,
        transactions: transactionsWithOperations,
        subscriptions,
        recurringRules,
        pendingMovements,
        budgetEntries,
        goals,
        wealthSnapshots: wealthSnapshotsWithBalances,
        contributions: contributionsWithAllocations,
        userInstruments,
        stockeventsSymbolMappings,
        stockeventsCashMappings,
        stockeventsCashSyncEntries,
      },
      200,
    );
  });

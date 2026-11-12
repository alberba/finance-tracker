/**
 * `GET /api/data/export` (WP4) — pure read, never writes. Dumps the
 * authenticated user's full private dataset as JSON, for backup or the
 * WP11 rollback path. `integration_credentials` is unconditionally
 * excluded — per the plan, credentials are never exported, encrypted or
 * not (WP12 owns that table; another agent owns its files this wave).
 *
 * The rows come from the shared private read (`private-read.ts`); this route
 * only adds the backup metadata and projects each movement's `tradeDetail`
 * row as its nested `operation`.
 */

import type { APIRoute } from "astro";
import { getDb } from "../../../db/client";
import { DATA_EXPORT_FORMAT } from "../../../lib/data-export-format";
import { jsonResponse, requirePrincipal, withApiErrorHandling } from "../../../lib/server/api-auth";
import { readPrivateDataset } from "../../../lib/server/private-read";
import { runServer } from "../../../lib/server/runtime";

export const GET: APIRoute = async ({ locals }) =>
  withApiErrorHandling("/api/data/export", async () => {
    const principal = requirePrincipal(locals);
    const db = getDb(locals);
    const userId = principal.userId;

    const privateData = await runServer(db, readPrivateDataset(userId));

    // The operation travels inside its movement (ADR 0002), in the same shape
    // the import hands back to `transactionsRepository.create`. It is the
    // export's own projection of the `tradeDetail` row the shared read returns.
    const transactionsWithOperations = privateData.transactions.map((transaction) => {
      const { tradeDetail, ...row } = transaction;
      return {
        ...row,
        operation: tradeDetail
          ? {
              instrumentId: tradeDetail.instrumentId,
              symbol: tradeDetail.symbol,
              side: tradeDetail.side,
              units: Number(tradeDetail.quantity),
              unitPrice: tradeDetail.price,
              fee: tradeDetail.fee,
            }
          : null,
      };
    });

    return jsonResponse(
      {
        format: DATA_EXPORT_FORMAT,
        exportedAt: new Date().toISOString(),
        userId,
        settings: privateData.settings,
        accounts: privateData.accounts,
        categories: privateData.categories,
        twrLiquidityAccounts: privateData.twrLiquidityAccounts,
        transactions: transactionsWithOperations,
        subscriptions: privateData.subscriptions,
        recurringRules: privateData.recurringRules,
        pendingMovements: privateData.pendingMovements,
        budgetEntries: privateData.budgetEntries,
        goals: privateData.goals,
        wealthSnapshots: privateData.wealthSnapshots,
        contributions: privateData.contributions,
        userInstruments: privateData.userInstruments,
        stockeventsSymbolMappings: privateData.stockeventsSymbolMappings,
        stockeventsCashMappings: privateData.stockeventsCashMappings,
        stockeventsCashSyncEntries: privateData.stockeventsCashSyncEntries,
      },
      200,
    );
  });

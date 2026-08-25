/**
 * `GET /api/bootstrap?year` (WP4) — pure read, never writes (fixes
 * Contradiction #8: unlike legacy `GET /api/state`, this never auto-seeds
 * on miss). Returns the full private dataset a client needs to initialize
 * its local cache, plus the current sync revision cursor so it can resume
 * incremental sync via `GET /api/changes?since=<revision>` afterwards.
 *
 * `year` (optional) narrows `transactions`/`budgetEntries`/`wealthSnapshots`
 * to that calendar year — the common case for the dashboard's initial
 * paint — while every other collection (accounts, categories, goals, etc.)
 * is small enough to always return in full.
 */

import type { APIRoute } from "astro";
import { getDb } from "../../db/client";
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
import { jsonResponse, requirePrincipal, withApiErrorHandling } from "../../lib/server/api-auth";

function parseYear(raw: string | null): number | undefined | "invalid" {
  if (!raw) {
    return undefined;
  }
  const year = Number(raw);
  if (!Number.isInteger(year) || year < 1900 || year > 9999) {
    return "invalid";
  }
  return year;
}

export const GET: APIRoute = async ({ request, locals }) =>
  withApiErrorHandling(async () => {
    const principal = requirePrincipal(locals);
    const url = new URL(request.url);
    const year = parseYear(url.searchParams.get("year"));
    if (year === "invalid") {
      return jsonResponse({ error: "Parámetro 'year' inválido." }, 400);
    }

    const db = getDb(locals);
    const userId = principal.userId;

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
        allocations: await contributionsRepository.listAllocationsByContribution(
          db,
          userId,
          contribution.id,
        ),
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

    return jsonResponse(
      {
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
      },
      200,
    );
  });

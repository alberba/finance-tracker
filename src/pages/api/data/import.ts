/**
 * `POST /api/data/import` (WP4) — accepts the same shape `GET
 * /api/data/export` produces (every collection optional) and re-creates it
 * for the authenticated user, inside one transaction.
 *
 * Every imported row gets a **new** server-generated id (repositories never
 * accept a client-supplied `id` — see WP1's "UUIDv7 generated server-side"
 * design decision), so foreign keys in the import payload (`accountId`,
 * `categoryId`, `recurringRuleId`, `contributionId`, `snapshotId`) are
 * remapped from the payload's old ids to the newly created rows' ids as
 * each collection is inserted, in dependency order (categories/accounts
 * first, leaf rows last). Rows whose referenced parent wasn't present in
 * the same payload (or itself failed to import) are skipped and reported
 * under `skipped`, rather than failing the whole import.
 *
 * `integration_credentials` is never accepted here — the export never
 * includes it, and this route does not touch that repository.
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
import * as stockeventsCashMappingsRepository from "../../../db/repositories/stockevents-cash-mappings";
import * as userSettingsRepository from "../../../db/repositories/user-settings";
import { jsonResponse, requirePrincipal, withApiErrorHandling } from "../../../lib/server/api-auth";
import { runInTransaction } from "../../../db/repositories/shared";

type Row = Record<string, unknown>;

function remapId(map: Map<string, string>, oldId: unknown): string | undefined {
  if (typeof oldId !== "string") {
    return undefined;
  }
  return map.get(oldId);
}

/** Remaps an optional nullable FK field: `undefined` in → `undefined` out; present-but-unresolvable → `"__skip__"` sentinel. */
function remapOptionalId(map: Map<string, string>, oldId: unknown): string | null | undefined | "__skip__" {
  if (oldId === undefined) {
    return undefined;
  }
  if (oldId === null) {
    return null;
  }
  const mapped = remapId(map, oldId);
  return mapped ?? "__skip__";
}

interface ImportSummary {
  imported: Record<string, number>;
  skipped: Record<string, number>;
}

export const POST: APIRoute = async ({ request, locals }) =>
  withApiErrorHandling("/api/data/import", async () => {
    const principal = requirePrincipal(locals);

    let body: Row;
    try {
      const parsedBody = await request.json();
      if (!parsedBody || typeof parsedBody !== "object") {
        return jsonResponse({ error: "Payload de importación inválido." }, 400);
      }
      body = parsedBody as Row;
    } catch {
      return jsonResponse({ error: "Cuerpo JSON inválido." }, 400);
    }

    const db = getDb(locals);
    const userId = principal.userId;

    const imported: Record<string, number> = {};
    const skipped: Record<string, number> = {};
    const bump = (record: Record<string, number>, key: string) => {
      record[key] = (record[key] ?? 0) + 1;
    };

    const summary: ImportSummary = await runInTransaction(db, async (tx) => {
      const categoryIdMap = new Map<string, string>();
      const accountIdMap = new Map<string, string>();
      const recurringRuleIdMap = new Map<string, string>();
      const wealthSnapshotIdMap = new Map<string, string>();
      const contributionIdMap = new Map<string, string>();

      // -- categories (no FK dependency) --------------------------------
      for (const row of asRows(body.categories)) {
        const created = await accountsRepository.createCategory(tx, userId, {
          legacyId: typeof row.legacyId === "string" ? row.legacyId : null,
          name: String(row.name ?? ""),
          kind: String(row.kind ?? ""),
          sortOrder: typeof row.sortOrder === "number" ? row.sortOrder : 0,
        });
        if (typeof row.id === "string") {
          categoryIdMap.set(row.id, created.id);
        }
        bump(imported, "categories");
      }

      // -- accounts (no FK dependency) ------------------------------------
      for (const row of asRows(body.accounts)) {
        const created = await accountsRepository.create(tx, userId, {
          legacyId: typeof row.legacyId === "string" ? row.legacyId : null,
          name: String(row.name ?? ""),
          kind: String(row.kind ?? ""),
          currency: String(row.currency ?? "EUR"),
          openingBalance: typeof row.openingBalance === "number" ? row.openingBalance : 0,
          isArchived: Boolean(row.isArchived),
        });
        if (typeof row.id === "string") {
          accountIdMap.set(row.id, created.id);
        }
        bump(imported, "accounts");
      }

      // -- transactions (FK: accountId, categoryId) ------------------------
      for (const row of asRows(body.transactions)) {
        const accountId = remapId(accountIdMap, row.accountId);
        if (!accountId) {
          bump(skipped, "transactions");
          continue;
        }
        const categoryId = remapOptionalId(categoryIdMap, row.categoryId);
        if (categoryId === "__skip__") {
          bump(skipped, "transactions");
          continue;
        }
        await transactionsRepository.create(tx, userId, {
          legacyId: typeof row.legacyId === "string" ? row.legacyId : null,
          accountId,
          categoryId: categoryId ?? null,
          type: String(row.type ?? ""),
          date: String(row.date ?? ""),
          description: typeof row.description === "string" ? row.description : null,
          amount: typeof row.amount === "number" ? row.amount : 0,
          currency: String(row.currency ?? "EUR"),
        });
        bump(imported, "transactions");
      }

      // -- subscriptions (FK: accountId, categoryId — both optional) -------
      for (const row of asRows(body.subscriptions)) {
        const accountId = remapOptionalId(accountIdMap, row.accountId);
        const categoryId = remapOptionalId(categoryIdMap, row.categoryId);
        if (accountId === "__skip__" || categoryId === "__skip__") {
          bump(skipped, "subscriptions");
          continue;
        }
        await subscriptionsRepository.create(tx, userId, {
          legacyId: typeof row.legacyId === "string" ? row.legacyId : null,
          name: String(row.name ?? ""),
          accountId: accountId ?? null,
          categoryId: categoryId ?? null,
          amount: typeof row.amount === "number" ? row.amount : 0,
          currency: String(row.currency ?? "EUR"),
          startDate: typeof row.startDate === "string" ? row.startDate : null,
          nextChargeDate: typeof row.nextChargeDate === "string" ? row.nextChargeDate : null,
          frequency: String(row.frequency ?? "monthly"),
          isActive: row.isActive === undefined ? true : Boolean(row.isActive),
        });
        bump(imported, "subscriptions");
      }

      // -- recurringRules (FK: accountId, categoryId — both optional) ------
      for (const row of asRows(body.recurringRules)) {
        const accountId = remapOptionalId(accountIdMap, row.accountId);
        const categoryId = remapOptionalId(categoryIdMap, row.categoryId);
        if (accountId === "__skip__" || categoryId === "__skip__") {
          bump(skipped, "recurringRules");
          continue;
        }
        const created = await recurringRulesRepository.create(tx, userId, {
          legacyId: typeof row.legacyId === "string" ? row.legacyId : null,
          name: String(row.name ?? ""),
          type: String(row.type ?? ""),
          accountId: accountId ?? null,
          categoryId: categoryId ?? null,
          amount: typeof row.amount === "number" ? row.amount : 0,
          currency: String(row.currency ?? "EUR"),
          frequency: String(row.frequency ?? "monthly"),
          nextRunDate: typeof row.nextRunDate === "string" ? row.nextRunDate : null,
          status: typeof row.status === "string" ? row.status : undefined,
        });
        if (typeof row.id === "string") {
          recurringRuleIdMap.set(row.id, created.id);
        }
        bump(imported, "recurringRules");
      }

      // -- pendingMovements (FK: recurringRuleId required; accountId/categoryId optional) --
      for (const row of asRows(body.pendingMovements)) {
        const recurringRuleId = remapId(recurringRuleIdMap, row.recurringRuleId);
        if (!recurringRuleId) {
          bump(skipped, "pendingMovements");
          continue;
        }
        const accountId = remapOptionalId(accountIdMap, row.accountId);
        const categoryId = remapOptionalId(categoryIdMap, row.categoryId);
        if (accountId === "__skip__" || categoryId === "__skip__") {
          bump(skipped, "pendingMovements");
          continue;
        }
        await pendingMovementsRepository.create(tx, userId, {
          legacyId: typeof row.legacyId === "string" ? row.legacyId : null,
          recurringRuleId,
          accountId: accountId ?? null,
          categoryId: categoryId ?? null,
          amount: typeof row.amount === "number" ? row.amount : 0,
          currency: String(row.currency ?? "EUR"),
          dueDate: String(row.dueDate ?? ""),
          status: typeof row.status === "string" ? row.status : undefined,
        });
        bump(imported, "pendingMovements");
      }

      // -- budgetEntries (FK: categoryId required) --------------------------
      for (const row of asRows(body.budgetEntries)) {
        const categoryId = remapId(categoryIdMap, row.categoryId);
        if (!categoryId) {
          bump(skipped, "budgetEntries");
          continue;
        }
        await budgetEntriesRepository.create(tx, userId, {
          legacyId: typeof row.legacyId === "string" ? row.legacyId : null,
          categoryId,
          year: typeof row.year === "number" ? row.year : new Date().getFullYear(),
          month: typeof row.month === "number" ? row.month : 1,
          amount: typeof row.amount === "number" ? row.amount : 0,
          currency: String(row.currency ?? "EUR"),
        });
        bump(imported, "budgetEntries");
      }

      // -- goals (no FK dependency) ------------------------------------------
      for (const row of asRows(body.goals)) {
        await goalsRepository.create(tx, userId, {
          legacyId: typeof row.legacyId === "string" ? row.legacyId : null,
          key: String(row.key ?? ""),
          name: String(row.name ?? ""),
          targetYear: typeof row.targetYear === "number" ? row.targetYear : null,
          targetAmount: typeof row.targetAmount === "number" ? row.targetAmount : 0,
          currency: String(row.currency ?? "EUR"),
        });
        bump(imported, "goals");
      }

      // -- wealthSnapshots (+ balances, FK: accountId optional) --------------
      for (const row of asRows(body.wealthSnapshots)) {
        const created = await wealthRepository.create(tx, userId, {
          legacyId: typeof row.legacyId === "string" ? row.legacyId : null,
          snapshotDate: String(row.snapshotDate ?? ""),
          year: typeof row.year === "number" ? row.year : new Date().getFullYear(),
          month: typeof row.month === "number" ? row.month : 1,
        });
        if (typeof row.id === "string") {
          wealthSnapshotIdMap.set(row.id, created.id);
        }
        bump(imported, "wealthSnapshots");

        for (const balance of asRows(row.balances)) {
          const accountId = remapOptionalId(accountIdMap, balance.accountId);
          if (accountId === "__skip__") {
            bump(skipped, "snapshotBalances");
            continue;
          }
          await wealthRepository.createBalance(tx, userId, {
            snapshotId: created.id,
            accountId: accountId ?? null,
            balance: typeof balance.balance === "number" ? balance.balance : 0,
            currency: String(balance.currency ?? "EUR"),
          });
          bump(imported, "snapshotBalances");
        }
      }

      // -- contributions (+ allocations, FK: accountId optional) ------------
      for (const row of asRows(body.contributions)) {
        const created = await contributionsRepository.create(tx, userId, {
          legacyId: typeof row.legacyId === "string" ? row.legacyId : null,
          date: String(row.date ?? ""),
          amount: typeof row.amount === "number" ? row.amount : 0,
          currency: String(row.currency ?? "EUR"),
          portfolioDate: typeof row.portfolioDate === "string" ? row.portfolioDate : null,
          portfolioValue: typeof row.portfolioValue === "number" ? row.portfolioValue : null,
          flow: typeof row.flow === "number" ? row.flow : null,
        });
        if (typeof row.id === "string") {
          contributionIdMap.set(row.id, created.id);
        }
        bump(imported, "contributions");

        for (const allocation of asRows(row.allocations)) {
          const accountId = remapOptionalId(accountIdMap, allocation.accountId);
          if (accountId === "__skip__") {
            bump(skipped, "contributionAllocations");
            continue;
          }
          await contributionsRepository.createAllocation(tx, userId, {
            contributionId: created.id,
            accountId: accountId ?? null,
            amount: typeof allocation.amount === "number" ? allocation.amount : 0,
            currency: String(allocation.currency ?? "EUR"),
          });
          bump(imported, "contributionAllocations");
        }
      }

      // -- userInstruments (FK: instrumentId must already exist globally; categoryId optional) --
      for (const row of asRows(body.userInstruments)) {
        if (typeof row.instrumentId !== "string") {
          bump(skipped, "userInstruments");
          continue;
        }
        const instrument = await marketRepository.getInstrument(tx, row.instrumentId);
        if (!instrument) {
          bump(skipped, "userInstruments");
          continue;
        }
        const categoryId = remapOptionalId(categoryIdMap, row.categoryId);
        if (categoryId === "__skip__") {
          bump(skipped, "userInstruments");
          continue;
        }
        await marketRepository.createUserInstrument(tx, userId, {
          instrumentId: row.instrumentId,
          categoryId: categoryId ?? null,
          alias: typeof row.alias === "string" ? row.alias : null,
        });
        bump(imported, "userInstruments");
      }

      // -- stockeventsSymbolMappings (FK: categoryId optional) ---------------
      for (const row of asRows(body.stockeventsSymbolMappings)) {
        const categoryId = remapOptionalId(categoryIdMap, row.categoryId);
        if (categoryId === "__skip__") {
          bump(skipped, "stockeventsSymbolMappings");
          continue;
        }
        await stockeventsSymbolMappingsRepository.create(tx, userId, {
          legacyId: typeof row.legacyId === "string" ? row.legacyId : null,
          categoryId: categoryId ?? null,
          stockeventsSymbol: String(row.stockeventsSymbol ?? ""),
          sync: row.sync === 1 || row.sync === true,
          watchlistId: typeof row.watchlistId === "string" ? row.watchlistId : null,
          hidden: row.hidden === 1 || row.hidden === true,
        });
        bump(imported, "stockeventsSymbolMappings");
      }

      // -- stockeventsCashMappings ---------------------------------------------
      for (const row of asRows((body as Row).stockeventsCashMappings)) {
        const accountId = remapOptionalId(accountIdMap, row.accountId);
        if (accountId === "__skip__") {
          bump(skipped, "stockeventsCashMappings");
          continue;
        }
        if (typeof row.watchlistId !== "string" || !row.watchlistId) {
          bump(skipped, "stockeventsCashMappings");
          continue;
        }
        await stockeventsCashMappingsRepository.upsertMapping(tx, userId, {
          accountId: accountId ?? (typeof row.accountId === "string" ? row.accountId : null),
          watchlistId: row.watchlistId,
        });
        bump(imported, "stockeventsCashMappings");
      }

      // -- settings (singleton) ----------------------------------------------
      if (body.settings && typeof body.settings === "object") {
        const settingsRow = body.settings as Row;
        const existing = await userSettingsRepository.get(tx, userId);
        const patch = {
          currency: typeof settingsRow.currency === "string" ? settingsRow.currency : undefined,
          locale: typeof settingsRow.locale === "string" ? settingsRow.locale : undefined,
          theme: typeof settingsRow.theme === "string" ? settingsRow.theme : undefined,
          stockeventsEnabled:
            settingsRow.stockeventsEnabled === 1 || settingsRow.stockeventsEnabled === true
              ? true
              : undefined,
        };
        if (existing) {
          await userSettingsRepository.update(tx, userId, patch);
        } else {
          await userSettingsRepository.create(tx, userId, patch);
        }
        bump(imported, "settings");
      }

      return { imported, skipped };
    });

    return jsonResponse({ ok: true, ...summary }, 200);
  });

function asRows(value: unknown): Row[] {
  if (!Array.isArray(value)) {
    return [];
  }
  return value.filter((item): item is Row => Boolean(item) && typeof item === "object");
}

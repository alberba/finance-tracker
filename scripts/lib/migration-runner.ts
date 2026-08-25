/**
 * WP9 — legacy v1 JSON → v2 relational migration.
 *
 * `runMigration()` is the single entry point both `scripts/migrate-v1-to-v2.ts`
 * (CLI) and `tests/integration/d1-v2/migration.test.ts` drive. It:
 *
 * 1. Creates (or reuses) the reserved "legacy owner" `users` row —
 *    consumed later by WP3's one-time linking logic.
 * 2. Maps every v1 collection onto its v2 repository `CreateXInput` shape,
 *    resolving cross-collection references (account/category/instrument/
 *    recurring-rule/contribution ids) that only exist as v1 string ids.
 * 3. Skips rows already present (matched by `legacyId`, or the closest
 *    available natural key for tables without one) so re-running the tool
 *    is a no-op on already-migrated data — no duplicates.
 * 4. Runs the whole thing inside one `runInTransaction`; `dryRun: true`
 *    forces a rollback at the very end via a sentinel throw, so *nothing*
 *    persists but the full report (counts/anomalies/checksum) is still
 *    computed exactly as a real run would.
 *
 * Money conversion is never done here directly — every repository
 * `create`/`bulkInsert` call takes plain float `amount`+`currency` and
 * converts at its own read/write boundary (WP2/WP6), so this module stays
 * float-only, matching every other v1 consumer.
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
  usersRepository,
  wealthRepository,
} from "../../src/db/repositories";
import { runInTransaction, type Db } from "../../src/db/repositories/shared";
import type { DataEncryptionEnv } from "../../src/lib/server/crypto/data-encryption";
import type { BudgetType, State } from "../../src/scripts/types";
import { sha256Hex, stableStringify } from "./migration-checksum";
import { categoryUnion, computeV1Parity } from "./migration-parity";
import {
  emptyCountsByCollection,
  type CollectionCounts,
  type MigrationAnomaly,
  type MigrationCollection,
  type MigrationReport,
} from "./migration-types";

export interface RunMigrationOptions {
  /** Legacy owner email, provisioned once and reused on every re-run. */
  legacyOwnerEmail: string;
  /** When true, the whole transaction is rolled back after the report is built. */
  dryRun?: boolean;
  /** Needed only if `state.stockEvents.apiKey` is set. */
  dataEncryptionEnv?: DataEncryptionEnv;
}

/** Thrown internally to force `runInTransaction` to roll back in dry-run mode. */
class DryRunRollback extends Error {
  constructor(public readonly report: MigrationReport) {
    super("dry-run rollback");
  }
}

function accountKind(source: "cash" | "investment" | "liability"): string {
  return source;
}

function pad2(value: number): string {
  return String(value).padStart(2, "0");
}

function dateWithLegacyMonth(date: string, month: number): string {
  const match = /^(\d{4})-(\d{2})-(\d{2})(.*)$/.exec(date);
  if (!match || month < 0 || month > 11) return date;

  const year = Number(match[1]);
  const sourceDay = Number(match[3]);
  const lastDay = new Date(Date.UTC(year, month + 1, 0)).getUTCDate();
  const day = Math.min(Math.max(sourceDay, 1), lastDay);
  return `${match[1]}-${pad2(month + 1)}-${pad2(day)}${match[4]}`;
}

export async function runMigration(db: Db, state: State, options: RunMigrationOptions): Promise<MigrationReport> {
  try {
    return await runInTransaction(db, async (tx) => applyMigration(tx, state, options));
  } catch (error) {
    if (error instanceof DryRunRollback) {
      return error.report;
    }
    throw error;
  }
}

async function applyMigration(db: Db, state: State, options: RunMigrationOptions): Promise<MigrationReport> {
  const counts = emptyCountsByCollection();
  const anomalies: MigrationAnomaly[] = [];
  const bump = (collection: MigrationCollection, field: keyof CollectionCounts, delta = 1) => {
    counts[collection][field] += delta;
  };
  const anomaly = (collection: string, legacyId: string, message: string) => {
    anomalies.push({ collection, legacyId, message });
  };

  // -- 0. legacy owner user ----------------------------------------------
  counts.users.source = 1;
  const existingUser = await usersRepository.getByEmail(db, options.legacyOwnerEmail);
  const userId = existingUser
    ? existingUser.id
    : (await usersRepository.create(db, {
        email: options.legacyOwnerEmail,
        displayName: "Legacy Owner",
        isLegacyOwner: true,
      })).id;
  if (existingUser) {
    // The reserved row may predate this run — e.g. a Cf-Access sign-in
    // resolved a principal for the same address before the migration ever
    // ran, which creates a plain user. `isLegacyOwner` is only ever set at
    // insert time, so without this the flag would stay 0 forever and
    // `findLegacyOwnerToLink` (and `/api/session`) would never see an owner.
    if (!existingUser.isLegacyOwner) {
      await usersRepository.update(db, userId, { isLegacyOwner: true });
    }
    bump("users", "skippedExisting");
  } else {
    bump("users", "inserted");
  }

  // -- 1. accounts (accounts + investmentAssets + liabilities) -----------
  const accountIdByKey = new Map<string, string>();
  {
    const sources: Array<{ kind: "cash" | "investment" | "liability"; entities: State["accounts"] }> = [
      { kind: "cash", entities: state.accounts },
      { kind: "investment", entities: state.investmentAssets },
      { kind: "liability", entities: state.liabilities },
    ];
    counts.accounts.source = sources.reduce((acc, s) => acc + s.entities.length, 0);

    const existing = await accountsRepository.listByUser(db, userId);
    for (const row of existing) {
      if (row.legacyId) {
        accountIdByKey.set(`${row.kind}:${row.legacyId}`, row.id);
      }
    }

    const toInsert: Array<{ key: string; input: Parameters<typeof accountsRepository.bulkInsert>[2][number] }> = [];
    for (const { kind, entities } of sources) {
      for (const entity of entities) {
        const key = `${accountKind(kind)}:${entity.id}`;
        if (accountIdByKey.has(key)) {
          bump("accounts", "skippedExisting");
          continue;
        }
        toInsert.push({
          key,
          input: {
            legacyId: entity.id,
            name: entity.name,
            kind,
            currency: state.currency,
            openingBalance: entity.openingBalance,
          },
        });
      }
    }
    if (toInsert.length) {
      const inserted = await accountsRepository.bulkInsert(
        db,
        userId,
        toInsert.map((item) => item.input),
      );
      inserted.forEach((row, index) => {
        accountIdByKey.set(toInsert[index].key, row.id);
      });
      bump("accounts", "inserted", inserted.length);
    }
  }

  // -- 2. twr_liquidity_accounts -------------------------------------------
  {
    counts.twrLiquidityAccounts.source = state.twrLiquidityAccountIds.length;
    const existing = await accountsRepository.listTwrLiquidityAccountsByUser(db, userId);
    const existingLegacyIds = new Set(existing.filter((r) => r.legacyId).map((r) => r.legacyId as string));
    for (const legacyAccountId of state.twrLiquidityAccountIds) {
      if (existingLegacyIds.has(legacyAccountId)) {
        bump("twrLiquidityAccounts", "skippedExisting");
        continue;
      }
      const v2AccountId = accountIdByKey.get(`cash:${legacyAccountId}`);
      if (!v2AccountId) {
        anomaly("twrLiquidityAccounts", legacyAccountId, "Referenced account not found; TWR liquidity flag dropped.");
        bump("twrLiquidityAccounts", "skippedAnomaly");
        continue;
      }
      const account = state.accounts.find((a) => a.id === legacyAccountId);
      await accountsRepository.createTwrLiquidityAccount(db, userId, {
        legacyId: legacyAccountId,
        accountId: v2AccountId,
        name: account ? `TWR: ${account.name}` : `TWR: ${legacyAccountId}`,
      });
      bump("twrLiquidityAccounts", "inserted");
    }
  }

  // -- 3. categories ---------------------------------------------------------
  const categoryIdByKey = new Map<string, string>();
  {
    const types: BudgetType[] = ["income", "expense", "investment"];
    const planned = types.flatMap((type) =>
      categoryUnion(state, type).map((name, sortOrder) => ({ type, name, sortOrder })),
    );
    counts.categories.source = planned.length;

    const existing = await accountsRepository.listCategoriesByUser(db, userId);
    for (const row of existing) {
      if (row.legacyId) {
        categoryIdByKey.set(`${row.kind}:${row.legacyId}`, row.id);
      }
    }

    const toInsert = planned.filter((item) => !categoryIdByKey.has(`${item.type}:${item.name}`));
    bump("categories", "skippedExisting", planned.length - toInsert.length);
    if (toInsert.length) {
      const inserted = await accountsRepository.bulkInsertCategories(
        db,
        userId,
        toInsert.map((item) => ({ legacyId: item.name, name: item.name, kind: item.type, sortOrder: item.sortOrder })),
      );
      inserted.forEach((row, index) => {
        categoryIdByKey.set(`${toInsert[index].type}:${toInsert[index].name}`, row.id);
      });
      bump("categories", "inserted", inserted.length);
    }
  }

  // -- 4. market_instruments + market_quotes (global reference data) --------
  const instrumentIdByLegacyId = new Map<string, string>();
  {
    counts.marketInstruments.source = state.instruments.length;
    for (const instrument of state.instruments) {
      const normalizedSymbol = instrument.symbol.trim().toUpperCase();
      const existingInstrument = await marketRepository.getInstrumentBySymbol(db, instrument.provider, normalizedSymbol);
      if (existingInstrument) {
        instrumentIdByLegacyId.set(instrument.id, existingInstrument.id);
        bump("marketInstruments", "skippedExisting");
        continue;
      }
      const created = await marketRepository.createInstrument(db, {
        legacyId: instrument.id,
        symbol: instrument.symbol,
        normalizedSymbol,
        provider: instrument.provider,
        assetClass: instrument.type,
        currency: instrument.currency,
      });
      instrumentIdByLegacyId.set(instrument.id, created.id);
      bump("marketInstruments", "inserted");
    }

    counts.marketQuotes.source = Object.keys(state.quotes).length;
    for (const [legacyInstrumentId, quote] of Object.entries(state.quotes)) {
      const v2InstrumentId = instrumentIdByLegacyId.get(quote.instrumentId || legacyInstrumentId);
      if (!v2InstrumentId) {
        anomaly("marketQuotes", legacyInstrumentId, "Instrument not found; quote dropped.");
        bump("marketQuotes", "skippedAnomaly");
        continue;
      }
      const quotedAt = quote.timestamp || new Date().toISOString();
      const existingQuotes = await marketRepository.listQuotesByInstrument(db, v2InstrumentId);
      if (existingQuotes.some((q) => q.quotedAt === quotedAt)) {
        bump("marketQuotes", "skippedExisting");
        continue;
      }
      await marketRepository.createQuote(db, {
        instrumentId: v2InstrumentId,
        price: quote.price,
        currency: quote.currency,
        quotedAt,
      });
      bump("marketQuotes", "inserted");
    }
  }

  // -- 5. user_instruments (per-user tracking join) --------------------------
  {
    counts.userInstruments.source = state.instruments.length;
    const existing = await marketRepository.listUserInstrumentsByUser(db, userId);
    const existingInstrumentIds = new Set(existing.map((r) => r.instrumentId));
    for (const instrument of state.instruments) {
      const v2InstrumentId = instrumentIdByLegacyId.get(instrument.id);
      if (!v2InstrumentId) {
        bump("userInstruments", "skippedAnomaly");
        continue;
      }
      if (existingInstrumentIds.has(v2InstrumentId)) {
        bump("userInstruments", "skippedExisting");
        continue;
      }
      await marketRepository.createUserInstrument(db, userId, {
        instrumentId: v2InstrumentId,
        // Best-effort: v2 has no normalized "investment asset" grouping FK
        // on this join table (see WP1 schema comment) — retained as a
        // human-readable annotation only, not a queryable reference.
        alias: instrument.investmentAssetId || null,
      });
      bump("userInstruments", "inserted");
    }
  }

  // -- 6. transactions (+ investment_trade_details) --------------------------
  const transactionIdByLegacyId = new Map<string, string>();
  {
    counts.transactions.source = state.transactions.length;
    const existing = await transactionsRepository.listByUser(db, userId);
    const existingLegacyIds = new Set<string>();
    for (const row of existing) {
      if (row.legacyId) {
        existingLegacyIds.add(row.legacyId);
        transactionIdByLegacyId.set(row.legacyId, row.id);
      }
    }

    const toInsert: Array<{ legacyId: string; input: Parameters<typeof transactionsRepository.bulkInsert>[2][number] }> =
      [];
    for (const tx of state.transactions) {
      if (existingLegacyIds.has(tx.id)) {
        bump("transactions", "skippedExisting");
        continue;
      }
      const v2AccountId = accountIdByKey.get(`cash:${tx.accountId}`);
      if (!v2AccountId) {
        anomaly("transactions", tx.id, `Account '${tx.accountId}' not found; transaction dropped.`);
        bump("transactions", "skippedAnomaly");
        continue;
      }
      const v2CategoryId = categoryIdByKey.get(`${tx.type}:${tx.category}`) ?? null;
      if (!v2CategoryId) {
        anomaly("transactions", tx.id, `Category '${tx.category}' (${tx.type}) not found; categoryId left null.`);
      }
      const canonicalDate = dateWithLegacyMonth(tx.date, tx.month);
      if (canonicalDate !== tx.date) {
        anomaly(
          "transactions",
          tx.id,
          `Date '${tx.date}' disagrees with legacy month ${tx.month}; normalized to '${canonicalDate}'.`,
        );
      }
      toInsert.push({
        legacyId: tx.id,
        input: {
          legacyId: tx.id,
          accountId: v2AccountId,
          categoryId: v2CategoryId,
          type: tx.type,
          date: canonicalDate,
          description: tx.description,
          amount: tx.amount,
          currency: state.currency,
        },
      });
    }
    if (toInsert.length) {
      const inserted = await transactionsRepository.bulkInsert(
        db,
        userId,
        toInsert.map((item) => item.input),
      );
      inserted.forEach((row, index) => {
        transactionIdByLegacyId.set(toInsert[index].legacyId, row.id);
      });
      bump("transactions", "inserted", inserted.length);
    }

    const investmentTxs = state.transactions.filter((tx) => tx.type === "investment");
    counts.investmentTradeDetails.source = investmentTxs.length;
    for (const tx of investmentTxs) {
      const v2TransactionId = transactionIdByLegacyId.get(tx.id);
      if (!v2TransactionId) {
        // Either just skipped as anomaly above, or a pre-existing tx from a
        // prior run — in the latter case the trade detail was created then too.
        continue;
      }
      const existingDetail = await transactionsRepository.getTradeDetailByTransaction(db, userId, v2TransactionId);
      if (existingDetail) {
        bump("investmentTradeDetails", "skippedExisting");
        continue;
      }
      const v2InstrumentId = tx.instrumentId ? (instrumentIdByLegacyId.get(tx.instrumentId) ?? null) : null;
      if (tx.instrumentId && !v2InstrumentId) {
        anomaly("investmentTradeDetails", tx.id, `Instrument '${tx.instrumentId}' not found; instrumentId left null.`);
      }
      await transactionsRepository.createTradeDetail(db, userId, {
        transactionId: v2TransactionId,
        instrumentId: v2InstrumentId,
        side: tx.side || "buy",
        quantity: String(tx.units ?? 0),
        price: tx.unitPrice ?? 0,
        fee: tx.fee ?? 0,
        currency: tx.movementCurrency || state.currency,
      });
      bump("investmentTradeDetails", "inserted");
    }
  }

  // -- 7. subscriptions --------------------------------------------------------
  {
    counts.subscriptions.source = state.subscriptions.length;
    const existing = await subscriptionsRepository.listByUser(db, userId);
    const existingLegacyIds = new Set(existing.filter((r) => r.legacyId).map((r) => r.legacyId as string));
    const toInsert: Array<Parameters<typeof subscriptionsRepository.bulkInsert>[2][number]> = [];
    for (const sub of state.subscriptions) {
      if (existingLegacyIds.has(sub.id)) {
        bump("subscriptions", "skippedExisting");
        continue;
      }
      const v2AccountId = accountIdByKey.get(`cash:${sub.accountId}`) ?? null;
      if (!v2AccountId) {
        anomaly("subscriptions", sub.id, `Account '${sub.accountId}' not found; accountId left null.`);
      }
      const v2CategoryId = categoryIdByKey.get(`expense:${sub.category}`) ?? null;
      if (!v2CategoryId) {
        anomaly("subscriptions", sub.id, `Category '${sub.category}' not found; categoryId left null.`);
      }
      const dayMatch = /^\d{4}-\d{2}-(\d{2})$/.exec(sub.startDate);
      toInsert.push({
        legacyId: sub.id,
        name: sub.name,
        categoryId: v2CategoryId,
        accountId: v2AccountId,
        amount: sub.amount,
        currency: state.currency,
        billingDay: dayMatch ? Number(dayMatch[1]) : null,
        frequency: sub.frequency,
        isActive: sub.active,
      });
    }
    if (toInsert.length) {
      await subscriptionsRepository.bulkInsert(db, userId, toInsert);
      bump("subscriptions", "inserted", toInsert.length);
    }
  }

  // -- 8. recurring_rules -------------------------------------------------------
  const recurringRuleIdByLegacyId = new Map<string, string>();
  {
    counts.recurringRules.source = state.recurringRules.length;
    const existing = await recurringRulesRepository.listByUser(db, userId);
    for (const row of existing) {
      if (row.legacyId) {
        recurringRuleIdByLegacyId.set(row.legacyId, row.id);
      }
    }
    const toInsert: Array<{ legacyId: string; input: Parameters<typeof recurringRulesRepository.bulkInsert>[2][number] }> =
      [];
    for (const rule of state.recurringRules) {
      if (recurringRuleIdByLegacyId.has(rule.id)) {
        bump("recurringRules", "skippedExisting");
        continue;
      }
      const v2AccountId = accountIdByKey.get(`cash:${rule.accountId}`) ?? null;
      if (!v2AccountId) {
        anomaly("recurringRules", rule.id, `Account '${rule.accountId}' not found; accountId left null.`);
      }
      const v2CategoryId = categoryIdByKey.get(`${rule.type}:${rule.category}`) ?? null;
      if (!v2CategoryId) {
        anomaly("recurringRules", rule.id, `Category '${rule.category}' (${rule.type}) not found; categoryId left null.`);
      }
      toInsert.push({
        legacyId: rule.id,
        input: {
          legacyId: rule.id,
          name: rule.description || rule.category,
          type: rule.type,
          accountId: v2AccountId,
          categoryId: v2CategoryId,
          amount: rule.amount,
          currency: state.currency,
          frequency: rule.frequency,
          nextRunDate: rule.nextOccurrenceDate,
          status: rule.active ? "active" : "paused",
        },
      });
    }
    if (toInsert.length) {
      const inserted = await recurringRulesRepository.bulkInsert(
        db,
        userId,
        toInsert.map((item) => item.input),
      );
      inserted.forEach((row, index) => {
        recurringRuleIdByLegacyId.set(toInsert[index].legacyId, row.id);
      });
      bump("recurringRules", "inserted", inserted.length);
    }
  }

  // -- 9. pending_movements ------------------------------------------------------
  {
    counts.pendingMovements.source = state.pendingMovements.length;
    const existing = await pendingMovementsRepository.listByUser(db, userId);
    const existingLegacyIds = new Set(existing.filter((r) => r.legacyId).map((r) => r.legacyId as string));
    const toInsert: Array<Parameters<typeof pendingMovementsRepository.bulkInsert>[2][number]> = [];
    for (const pm of state.pendingMovements) {
      if (existingLegacyIds.has(pm.id)) {
        bump("pendingMovements", "skippedExisting");
        continue;
      }
      const v2RuleId = recurringRuleIdByLegacyId.get(pm.ruleId);
      if (!v2RuleId) {
        anomaly("pendingMovements", pm.id, `Recurring rule '${pm.ruleId}' not found; pending movement dropped.`);
        bump("pendingMovements", "skippedAnomaly");
        continue;
      }
      const v2AccountId = accountIdByKey.get(`cash:${pm.accountId}`) ?? null;
      const v2CategoryId = categoryIdByKey.get(`${pm.type}:${pm.category}`) ?? null;
      toInsert.push({
        legacyId: pm.id,
        recurringRuleId: v2RuleId,
        accountId: v2AccountId,
        categoryId: v2CategoryId,
        amount: pm.amount,
        currency: state.currency,
        dueDate: pm.occurrenceDate,
        status: pm.status,
      });
    }
    if (toInsert.length) {
      await pendingMovementsRepository.bulkInsert(db, userId, toInsert);
      bump("pendingMovements", "inserted", toInsert.length);
    }
  }

  // -- 10. budget_entries ----------------------------------------------------------
  {
    const types: BudgetType[] = ["income", "expense", "investment"];
    const planned: Array<{ legacyId: string; categoryId: string | null; type: BudgetType; category: string; month: number; amount: number }> =
      [];
    for (const type of types) {
      for (const category of categoryUnion(state, type)) {
        const monthly = state.budget[type][category] || [];
        const v2CategoryId = categoryIdByKey.get(`${type}:${category}`) ?? null;
        for (let month = 0; month < 12; month += 1) {
          planned.push({
            legacyId: `${type}:${category}:${state.year}-${pad2(month)}`,
            categoryId: v2CategoryId,
            type,
            category,
            month,
            amount: monthly[month] || 0,
          });
        }
      }
    }
    counts.budgetEntries.source = planned.length;

    const existing = await budgetEntriesRepository.listByUser(db, userId);
    const existingLegacyIds = new Set(existing.filter((r) => r.legacyId).map((r) => r.legacyId as string));
    const toInsert: Array<Parameters<typeof budgetEntriesRepository.bulkInsert>[2][number]> = [];
    for (const item of planned) {
      if (existingLegacyIds.has(item.legacyId)) {
        bump("budgetEntries", "skippedExisting");
        continue;
      }
      if (!item.categoryId) {
        anomaly("budgetEntries", item.legacyId, `Category '${item.category}' (${item.type}) not found; entry dropped.`);
        bump("budgetEntries", "skippedAnomaly");
        continue;
      }
      toInsert.push({
        legacyId: item.legacyId,
        categoryId: item.categoryId,
        year: state.year,
        month: item.month,
        amount: item.amount,
        currency: state.currency,
      });
    }
    if (toInsert.length) {
      await budgetEntriesRepository.bulkInsert(db, userId, toInsert);
      bump("budgetEntries", "inserted", toInsert.length);
    }
  }

  // -- 11. goals ------------------------------------------------------------------
  {
    const entries = Object.entries(state.goals);
    counts.goals.source = entries.length;
    const existing = await goalsRepository.listByUser(db, userId);
    const existingLegacyIds = new Set(existing.filter((r) => r.legacyId).map((r) => r.legacyId as string));
    const toInsert: Array<Parameters<typeof goalsRepository.bulkInsert>[2][number]> = [];
    for (const [key, goal] of entries) {
      if (existingLegacyIds.has(key)) {
        bump("goals", "skippedExisting");
        continue;
      }
      toInsert.push({
        legacyId: key,
        key,
        name: goal.name,
        targetYear: goal.targetYear,
        targetAmount: goal.targetAmount,
        currency: state.currency,
      });
    }
    if (toInsert.length) {
      await goalsRepository.bulkInsert(db, userId, toInsert);
      bump("goals", "inserted", toInsert.length);
    }
  }

  // -- 12. wealth_snapshots + snapshot_balances -------------------------------------
  {
    const entries = Object.entries(state.snapshots);
    counts.wealthSnapshots.source = entries.length;
    const existing = await wealthRepository.listByUser(db, userId);
    const snapshotIdByLegacyId = new Map<string, string>();
    for (const row of existing) {
      if (row.legacyId) {
        snapshotIdByLegacyId.set(row.legacyId, row.id);
      }
    }
    const toInsert: Array<{ legacyId: string; monthKey: string; input: Parameters<typeof wealthRepository.bulkInsert>[2][number] }> =
      [];
    for (const [monthKey, snapshot] of entries) {
      const legacyId = `${state.year}-${monthKey}`;
      if (snapshotIdByLegacyId.has(legacyId)) {
        bump("wealthSnapshots", "skippedExisting");
        continue;
      }
      toInsert.push({
        legacyId,
        monthKey,
        input: {
          legacyId,
          snapshotDate: `${state.year}-${pad2(snapshot.month + 1)}-01`,
          year: state.year,
          month: snapshot.month,
        },
      });
    }
    if (toInsert.length) {
      const inserted = await wealthRepository.bulkInsert(
        db,
        userId,
        toInsert.map((item) => item.input),
      );
      inserted.forEach((row, index) => {
        snapshotIdByLegacyId.set(toInsert[index].legacyId, row.id);
      });
      bump("wealthSnapshots", "inserted", inserted.length);
    }

    for (const [monthKey, snapshot] of entries) {
      const legacyId = `${state.year}-${monthKey}`;
      const v2SnapshotId = snapshotIdByLegacyId.get(legacyId);
      if (!v2SnapshotId) {
        continue;
      }
      const existingBalances = await wealthRepository.listBalancesBySnapshot(db, userId, v2SnapshotId);
      counts.snapshotBalances.source +=
        Object.keys(snapshot.accounts).length +
        Object.keys(snapshot.investments).length +
        Object.keys(snapshot.liabilities).length;
      if (existingBalances.length > 0) {
        // Snapshot already fully migrated in a prior run — balances have no
        // legacyId of their own, so we treat "any balances present" as the
        // idempotency signal for this snapshot.
        bump(
          "snapshotBalances",
          "skippedExisting",
          Object.keys(snapshot.accounts).length + Object.keys(snapshot.investments).length + Object.keys(snapshot.liabilities).length,
        );
        continue;
      }
      const kinds: Array<["cash" | "investment" | "liability", Record<string, number>]> = [
        ["cash", snapshot.accounts],
        ["investment", snapshot.investments],
        ["liability", snapshot.liabilities],
      ];
      const toInsertBalances: Parameters<typeof wealthRepository.bulkInsertBalances>[2] = [];
      for (const [kind, byAccount] of kinds) {
        for (const [legacyAccountId, balance] of Object.entries(byAccount)) {
          const v2AccountId = accountIdByKey.get(`${kind}:${legacyAccountId}`) ?? null;
          if (!v2AccountId) {
            anomaly("snapshotBalances", `${legacyId}:${legacyAccountId}`, `Account '${legacyAccountId}' (${kind}) not found; accountId left null.`);
          }
          toInsertBalances.push({ snapshotId: v2SnapshotId, accountId: v2AccountId, balance, currency: state.currency });
        }
      }
      if (toInsertBalances.length) {
        await wealthRepository.bulkInsertBalances(db, userId, toInsertBalances);
        bump("snapshotBalances", "inserted", toInsertBalances.length);
      }
    }
  }

  // -- 13. contributions + contribution_allocations ---------------------------------
  {
    counts.contributions.source = state.contributions.length;
    const existing = await contributionsRepository.listByUser(db, userId);
    const contributionIdByLegacyId = new Map<string, string>();
    const preExisting = new Set<string>();
    for (const row of existing) {
      if (row.legacyId) {
        contributionIdByLegacyId.set(row.legacyId, row.id);
        preExisting.add(row.legacyId);
      }
    }
    const toInsert: Array<{ legacyId: string; input: Parameters<typeof contributionsRepository.bulkInsert>[2][number] }> = [];
    for (const c of state.contributions) {
      if (preExisting.has(c.id)) {
        bump("contributions", "skippedExisting");
        continue;
      }
      toInsert.push({
        legacyId: c.id,
        input: {
          legacyId: c.id,
          date: c.date,
          amount: c.amount,
          currency: state.currency,
          portfolioDate: c.portfolioDate,
          portfolioValue: c.portfolioValue,
          flow: c.flow,
        },
      });
    }
    if (toInsert.length) {
      const inserted = await contributionsRepository.bulkInsert(
        db,
        userId,
        toInsert.map((item) => item.input),
      );
      inserted.forEach((row, index) => {
        contributionIdByLegacyId.set(toInsert[index].legacyId, row.id);
      });
      bump("contributions", "inserted", inserted.length);
    }

    for (const c of state.contributions) {
      const allocations = c.flowAllocations || [];
      counts.contributionAllocations.source += allocations.length;
      if (!allocations.length) {
        continue;
      }
      const v2ContributionId = contributionIdByLegacyId.get(c.id);
      if (!v2ContributionId) {
        bump("contributionAllocations", "skippedAnomaly", allocations.length);
        continue;
      }
      const existingAllocations = await contributionsRepository.listAllocationsByContribution(db, userId, v2ContributionId);
      if (existingAllocations.length >= allocations.length) {
        bump("contributionAllocations", "skippedExisting", allocations.length);
        continue;
      }
      const toInsertAllocations: Parameters<typeof contributionsRepository.bulkInsertAllocations>[2] = [];
      for (const alloc of allocations) {
        const v2AccountId = accountIdByKey.get(`cash:${alloc.accountId}`) ?? null;
        if (!v2AccountId) {
          anomaly("contributionAllocations", c.id, `Account '${alloc.accountId}' not found; accountId left null.`);
        }
        toInsertAllocations.push({
          contributionId: v2ContributionId,
          accountId: v2AccountId,
          amount: alloc.amount,
          currency: state.currency,
        });
      }
      await contributionsRepository.bulkInsertAllocations(db, userId, toInsertAllocations);
      bump("contributionAllocations", "inserted", toInsertAllocations.length);
    }
  }

  // -- 14. integration_credentials (Stock Events API key) ----------------------------
  {
    counts.integrationCredentials.source = state.stockEvents.apiKey ? 1 : 0;
    if (state.stockEvents.apiKey) {
      const env = options.dataEncryptionEnv;
      const alreadyMigrated = await integrationCredentialsRepository.hasProvider(db, userId, "stockevents");
      if (alreadyMigrated) {
        bump("integrationCredentials", "skippedExisting");
      } else if (!env?.DATA_ENCRYPTION_KEY) {
        anomaly(
          "integrationCredentials",
          "stockevents",
          "DATA_ENCRYPTION_KEY not configured; Stock Events API key was not migrated (was plaintext in v1, per Contradiction #7).",
        );
        bump("integrationCredentials", "skippedAnomaly");
      } else {
        await integrationCredentialsRepository.create(db, userId, { provider: "stockevents", secret: state.stockEvents.apiKey }, env);
        bump("integrationCredentials", "inserted");
      }
    }
  }

  // -- 15. stockevents_symbol_mappings -----------------------------------------------
  {
    counts.stockeventsSymbolMappings.source = state.stockEvents.symbolMappings.length;
    const existing = await stockeventsSymbolMappingsRepository.listByUser(db, userId);
    const existingLegacyIds = new Set(existing.filter((r) => r.legacyId).map((r) => r.legacyId as string));
    const toInsert: Array<Parameters<typeof stockeventsSymbolMappingsRepository.bulkInsert>[2][number]> = [];
    for (const mapping of state.stockEvents.symbolMappings) {
      if (existingLegacyIds.has(mapping.symbol)) {
        bump("stockeventsSymbolMappings", "skippedExisting");
        continue;
      }
      toInsert.push({
        legacyId: mapping.symbol,
        categoryId: null,
        stockeventsSymbol: mapping.targetSymbol || mapping.symbol,
      });
    }
    if (toInsert.length) {
      await stockeventsSymbolMappingsRepository.bulkInsert(db, userId, toInsert);
      bump("stockeventsSymbolMappings", "inserted", toInsert.length);
    }
  }

  if (state.instruments.length > 0) {
    anomaly(
      "userInstruments",
      "*",
      "v1 investmentAssetId grouping has no normalized FK on v2's user_instruments table (see WP1 schema comment); retained only as the `alias` field for manual reference.",
    );
  }
  if (Object.values(state.categoryEmojis).length > 0) {
    anomaly("categories", "*", "v1 categoryEmojis overrides have no v2 column; not migrated.");
  }

  const parity = computeV1Parity(state);
  const legacyIdsDigest = sha256Hex(
    stableStringify({
      accounts: [...state.accounts, ...state.investmentAssets, ...state.liabilities].map((e) => e.id),
      transactions: state.transactions.map((t) => t.id),
      subscriptions: state.subscriptions.map((s) => s.id),
      recurringRules: state.recurringRules.map((r) => r.id),
      pendingMovements: state.pendingMovements.map((p) => p.id),
      contributions: state.contributions.map((c) => c.id),
      instruments: state.instruments.map((i) => i.id),
      goals: Object.keys(state.goals),
    }),
  );
  const paritySnapshotDigest = sha256Hex(stableStringify(parity));

  const report: MigrationReport = {
    userId,
    legacyOwnerEmail: options.legacyOwnerEmail,
    dryRun: Boolean(options.dryRun),
    counts,
    anomalies,
    checksum: { legacyIdsDigest, paritySnapshotDigest },
  };

  if (options.dryRun) {
    throw new DryRunRollback(report);
  }

  return report;
}

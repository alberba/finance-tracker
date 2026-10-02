/**
 * Pure parity-metric computation over a v1 `State` (WP9).
 *
 * No D1/DB imports here on purpose: this module is unit-testable in
 * isolation, and is reused by both `scripts/migrate-v1-to-v2.ts` (to embed a
 * checksum in the migration report) and `scripts/validate-migration-parity.ts`
 * (to diff against the same aggregates recomputed from v2 — see
 * `scripts/lib/migration-v2-read.ts` for the v2-side counterpart).
 */

import type { BudgetType, GoalKey, State, TransactionType } from "../../src/scripts/types";
import { TRANSACTION_TYPES } from "../../src/scripts/types";
import type { MigrationCollection, ParityDiscrepancy, ParitySnapshot } from "./migration-types";

const EPSILON = 0.005; // half a cent — money amounts are rounded to 2dp upstream

function round2(value: number): number {
  return Math.round((value + Number.EPSILON) * 100) / 100;
}

/** Union of a category's declared-list membership and any orphaned budget-dict keys. */
export function categoryUnion(state: State, type: BudgetType): string[] {
  const listKey = type === "income" ? "incomeCategories" : type === "expense" ? "expenseCategories" : "investmentCategories";
  const declared = state[listKey] as string[];
  const budgetKeys = Object.keys(state.budget[type] || {});
  return Array.from(new Set([...declared, ...budgetKeys]));
}

export function computeV1Parity(state: State): ParitySnapshot {
  const monthlyTotals = {} as Record<TransactionType, number[]>;
  for (const type of TRANSACTION_TYPES) {
    monthlyTotals[type] = Array.from({ length: 12 }, () => 0);
  }
  for (const tx of state.transactions) {
    const match = /^(\d{4})-\d{2}-\d{2}$/.exec(tx.date);
    if (match && Number(match[1]) !== state.year) {
      continue;
    }
    const month = Math.min(11, Math.max(0, tx.month));
    monthlyTotals[tx.type][month] = round2(monthlyTotals[tx.type][month] + tx.amount);
  }

  const wealthPerSnapshot: ParitySnapshot["wealthPerSnapshot"] = {};
  for (const [monthKey, snapshot] of Object.entries(state.snapshots)) {
    const sum = (map: Record<string, number>) => round2(Object.values(map).reduce((acc, v) => acc + v, 0));
    const accounts = sum(snapshot.accounts);
    const investments = sum(snapshot.investments);
    const liabilities = sum(snapshot.liabilities);
    wealthPerSnapshot[`${state.year}-${monthKey}`] = {
      accounts,
      investments,
      liabilities,
      net: round2(accounts + investments - liabilities),
    };
  }

  const budgetTotals = {} as Record<BudgetType, Record<string, number>>;
  (["income", "expense", "investment"] as BudgetType[]).forEach((type) => {
    budgetTotals[type] = {};
    for (const category of categoryUnion(state, type)) {
      const monthly = state.budget[type][category] || [];
      budgetTotals[type][category] = round2(monthly.reduce((acc, v) => acc + (v || 0), 0));
    }
  });

  const goalTargets = {} as Record<GoalKey, number>;
  for (const [key, goal] of Object.entries(state.goals)) {
    goalTargets[key as GoalKey] = goal.targetAmount;
  }

  const accountCount = state.accounts.length + state.investmentAssets.length + state.liabilities.length;
  const categoryCount = (["income", "expense", "investment"] as BudgetType[]).reduce(
    (acc, type) => acc + categoryUnion(state, type).length,
    0,
  );
  const budgetEntryCount = (["income", "expense", "investment"] as BudgetType[]).reduce(
    (acc, type) => acc + categoryUnion(state, type).length * 12,
    0,
  );

  const counts: Record<MigrationCollection, number> = {
    users: 1,
    accounts: accountCount,
    twrLiquidityAccounts: state.twrLiquidityAccountIds.length,
    categories: categoryCount,
    marketInstruments: state.instruments.length,
    marketQuotes: Object.keys(state.quotes).length,
    userInstruments: state.instruments.length,
    transactions: state.transactions.length,
    investmentTradeDetails: state.transactions.filter((tx) => tx.type === "investment").length,
    subscriptions: state.subscriptions.length,
    recurringRules: state.recurringRules.length,
    pendingMovements: state.pendingMovements.length,
    budgetEntries: budgetEntryCount,
    goals: Object.keys(state.goals).length,
    wealthSnapshots: Object.keys(state.snapshots).length,
    snapshotBalances: Object.values(state.snapshots).reduce(
      (acc, snapshot) =>
        acc +
        Object.keys(snapshot.accounts).length +
        Object.keys(snapshot.investments).length +
        Object.keys(snapshot.liabilities).length,
      0,
    ),
    contributions: state.contributions.length,
    contributionAllocations: state.contributions.reduce(
      (acc, contribution) => acc + (contribution.flowAllocations?.length || 0),
      0,
    ),
    integrationCredentials: state.stockEvents.apiKey ? 1 : 0,
    stockeventsSymbolMappings: state.stockEvents.symbolMappings.length,
  };

  return { counts, monthlyTotals, wealthPerSnapshot, budgetTotals, goalTargets };
}

/** Compares two parity snapshots and returns every discrepancy found (empty = parity OK). */
export function diffParity(v1: ParitySnapshot, v2: ParitySnapshot): ParityDiscrepancy[] {
  const discrepancies: ParityDiscrepancy[] = [];

  for (const collection of Object.keys(v1.counts) as MigrationCollection[]) {
    if (v1.counts[collection] !== v2.counts[collection]) {
      discrepancies.push({
        path: `counts.${collection}`,
        v1Value: v1.counts[collection],
        v2Value: v2.counts[collection],
      });
    }
  }

  for (const type of TRANSACTION_TYPES) {
    v1.monthlyTotals[type].forEach((v1Total, month) => {
      const v2Total = v2.monthlyTotals[type]?.[month] ?? 0;
      if (Math.abs(v1Total - v2Total) > EPSILON) {
        discrepancies.push({ path: `monthlyTotals.${type}.${month}`, v1Value: v1Total, v2Value: v2Total });
      }
    });
  }

  const snapshotKeys = new Set([...Object.keys(v1.wealthPerSnapshot), ...Object.keys(v2.wealthPerSnapshot)]);
  for (const key of snapshotKeys) {
    const a = v1.wealthPerSnapshot[key];
    const b = v2.wealthPerSnapshot[key];
    if (!a || !b) {
      discrepancies.push({ path: `wealthPerSnapshot.${key}`, v1Value: a, v2Value: b });
      continue;
    }
    (["accounts", "investments", "liabilities", "net"] as const).forEach((field) => {
      if (Math.abs(a[field] - b[field]) > EPSILON) {
        discrepancies.push({ path: `wealthPerSnapshot.${key}.${field}`, v1Value: a[field], v2Value: b[field] });
      }
    });
  }

  (["income", "expense", "investment"] as BudgetType[]).forEach((type) => {
    const categories = new Set([...Object.keys(v1.budgetTotals[type]), ...Object.keys(v2.budgetTotals[type] || {})]);
    for (const category of categories) {
      const a = v1.budgetTotals[type][category] ?? 0;
      const b = v2.budgetTotals[type]?.[category] ?? 0;
      if (Math.abs(a - b) > EPSILON) {
        discrepancies.push({ path: `budgetTotals.${type}.${category}`, v1Value: a, v2Value: b });
      }
    }
  });

  for (const key of Object.keys(v1.goalTargets) as GoalKey[]) {
    const a = v1.goalTargets[key];
    const b = v2.goalTargets[key] ?? 0;
    if (Math.abs(a - b) > EPSILON) {
      discrepancies.push({ path: `goalTargets.${key}`, v1Value: a, v2Value: b });
    }
  }

  return discrepancies;
}

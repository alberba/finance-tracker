import { FINANCE_TRACKER_SEED } from "../data/seed";
import {
  DEFAULT_GOALS,
  isTransactionType,
  type BudgetType,
  type Contribution,
  type Goal,
  type GoalKey,
  type SnapshotRow,
  type State,
  type Transaction,
} from "./types";
import { clamp, monthFromISO, parseFloatSafe, parseIntSafe, round2, slug, todayISO, uid } from "./utils";

export const STORAGE_KEY = "finance-tracker-state-v1";
export const INDEXED_DB_NAME = "finance-tracker-db-v1";
export const INDEXED_DB_VERSION = 1;
export const INDEXED_DB_STORE = "state";
export const INDEXED_DB_RECORD_KEY = "current";

const FALLBACK_BASE_SEED = {
  meta: {
    source: "manual",
    generatedAt: new Date().toISOString(),
    version: 1,
    savedAt: null,
  },
  year: new Date().getFullYear(),
  currency: "EUR",
  accounts: [],
  investmentAssets: [],
  liabilities: [],
  incomeCategories: ["Nómina", "Extra"],
  expenseCategories: ["Comida", "Vivienda"],
  investmentCategories: ["Fondos Indexados"],
  transactions: [],
  snapshots: {},
  budget: { income: {}, expense: {}, investment: {} },
  goals: {},
  contributions: [],
};

export const BASE_SEED: unknown = FINANCE_TRACKER_SEED || FALLBACK_BASE_SEED;

export function loadPersistedState(): unknown | null {
  try {
    const raw = localStorage.getItem(STORAGE_KEY);
    if (!raw) {
      return null;
    }
    return JSON.parse(raw);
  } catch {
    return null;
  }
}

export function persistState(state: State): string {
  state.meta = state.meta || {
    source: "manual",
    generatedAt: new Date().toISOString(),
    version: 1,
    savedAt: null,
  };

  state.meta.savedAt = new Date().toISOString();
  localStorage.setItem(STORAGE_KEY, JSON.stringify(state));
  return state.meta.savedAt;
}

export async function loadIndexedDbState(): Promise<unknown | null> {
  if (!supportsIndexedDb()) {
    return null;
  }

  try {
    const db = await openIndexedDb();
    const value = await readIndexedDbValue(db, INDEXED_DB_RECORD_KEY);
    db.close();
    return value ?? null;
  } catch {
    return null;
  }
}

export async function persistIndexedDbState(state: State): Promise<void> {
  if (!supportsIndexedDb()) {
    return;
  }

  try {
    const db = await openIndexedDb();
    await writeIndexedDbValue(db, INDEXED_DB_RECORD_KEY, state);
    db.close();
  } catch {
    // No-op: localStorage remains the primary persistence mechanism.
  }
}

export function normalizeState(candidate: unknown): State {
  const input = (candidate || {}) as any;
  const base = (BASE_SEED || {}) as any;

  const year = parseIntSafe(input?.year, base.year || new Date().getFullYear());
  const safe: State = {
    meta: {
      source: input?.meta?.source || base.meta?.source || "manual",
      generatedAt: input?.meta?.generatedAt || base.meta?.generatedAt || new Date().toISOString(),
      version: 1,
      savedAt: input?.meta?.savedAt || null,
    },
    year,
    currency: String(input?.currency || base.currency || "EUR").toUpperCase().slice(0, 3),
    accounts: normalizeEntities(input?.accounts || base.accounts || []),
    investmentAssets: normalizeEntities(input?.investmentAssets || base.investmentAssets || []),
    liabilities: normalizeEntities(input?.liabilities || base.liabilities || []),
    incomeCategories: normalizeStringList(input?.incomeCategories || base.incomeCategories || []),
    expenseCategories: normalizeStringList(input?.expenseCategories || base.expenseCategories || []),
    investmentCategories: normalizeStringList(input?.investmentCategories || base.investmentCategories || []),
    transactions: normalizeTransactions(input?.transactions || base.transactions || []),
    snapshots: normalizeSnapshots(input?.snapshots || base.snapshots || {}),
    budget: normalizeBudget(input?.budget || base.budget || {}),
    goals: normalizeGoals(input?.goals || base.goals || {}, year),
    contributions: normalizeContributions(input?.contributions || base.contributions || []),
  };

  if (!safe.investmentCategories.length) {
    safe.investmentCategories = safe.investmentAssets.map((asset) => asset.name);
  }

  syncBudgetFromCategories(safe);
  sortTransactionsInState(safe);
  sortContributionsInState(safe);

  return safe;
}

export function sortTransactionsInState(targetState: State): void {
  targetState.transactions.sort((a, b) => {
    const byDate = String(a.date).localeCompare(String(b.date));
    if (byDate !== 0) {
      return byDate;
    }
    return String(a.id).localeCompare(String(b.id));
  });
}

export function sortContributionsInState(targetState: State): void {
  targetState.contributions.sort((a, b) => {
    const byDate = String(a.portfolioDate || a.date).localeCompare(String(b.portfolioDate || b.date));
    if (byDate !== 0) {
      return byDate;
    }
    return String(a.id).localeCompare(String(b.id));
  });
}

function normalizeEntities(list: unknown): State["accounts"] {
  const items = Array.isArray(list) ? list : [];
  return items
    .map((item: any) => ({
      id: slug(item.id || item.name || uid("item")),
      name: String(item.name || item.id || "Item"),
      openingBalance: round2(parseFloatSafe(item.openingBalance, 0)),
    }))
    .filter((item: any) => item.name);
}

function normalizeStringList(list: unknown): string[] {
  const items = Array.isArray(list) ? list : [];
  return Array.from(
    new Set(
      items
        .map((item: any) => String(item || "").trim())
        .filter((item: string) => Boolean(item))
    )
  );
}

function normalizeTransactions(list: unknown): Transaction[] {
  const items = Array.isArray(list) ? list : [];
  return items
    .map((item: any) => ({
      id: String(item.id || uid("tx")),
      date: String(item.date || todayISO()),
      month: clamp(parseIntSafe(item.month, monthFromISO(item.date) ?? 0), 0, 11),
      type: isTransactionType(item.type) ? item.type : "expense",
      accountId: String(item.accountId || ""),
      category: String(item.category || "Sin categoría"),
      description: String(item.description || ""),
      amount: round2(parseFloatSafe(item.amount, 0)),
    }))
    .filter((item) => item.amount >= 0);
}

function normalizeSnapshots(input: unknown): Record<string, SnapshotRow> {
  const rawInput = (input || {}) as Record<string, unknown>;
  const output: Record<string, SnapshotRow> = {};

  Object.entries(rawInput).forEach(([monthKey, snapshotRaw]) => {
    const month = clamp(parseIntSafe(monthKey, 0), 0, 11);
    const snapshot = (snapshotRaw || {}) as Partial<SnapshotRow>;
    output[String(month)] = {
      month,
      accounts: normalizeNumberMap(snapshot?.accounts || {}),
      investments: normalizeNumberMap(snapshot?.investments || {}),
      liabilities: normalizeNumberMap(snapshot?.liabilities || {}),
    };
  });

  return output;
}

function normalizeNumberMap(map: unknown): Record<string, number> {
  const output: Record<string, number> = {};
  Object.entries((map || {}) as Record<string, unknown>).forEach(([key, value]) => {
    const number = parseFloatSafe(value, NaN);
    if (!Number.isNaN(number)) {
      output[String(key)] = round2(number);
    }
  });
  return output;
}

function normalizeBudget(budget: unknown): State["budget"] {
  const rawBudget = (budget || {}) as any;
  const safe: State["budget"] = {
    income: {},
    expense: {},
    investment: {},
  };

  (["income", "expense", "investment"] as BudgetType[]).forEach((type) => {
    Object.entries(rawBudget[type] || {}).forEach(([category, values]) => {
      const monthlyValues = values as any[];
      safe[type][category] = Array.from({ length: 12 }, (_, month) =>
        round2(parseFloatSafe(monthlyValues?.[month], 0))
      );
    });
  });

  return safe;
}

function normalizeGoals(goals: unknown, year: number): Record<GoalKey, Goal> {
  const rawGoals = (goals || {}) as any;
  const defaults = DEFAULT_GOALS(year);
  const safe = {} as Record<GoalKey, Goal>;

  (Object.keys(defaults) as GoalKey[]).forEach((key) => {
    safe[key] = {
      name: String(rawGoals?.[key]?.name || defaults[key].name),
      targetYear: parseIntSafe(rawGoals?.[key]?.targetYear, defaults[key].targetYear),
      targetAmount: round2(parseFloatSafe(rawGoals?.[key]?.targetAmount, defaults[key].targetAmount)),
    };
  });

  return safe;
}

function normalizeContributions(list: unknown): Contribution[] {
  const items = Array.isArray(list) ? list : [];
  return items
    .map((item: any) => ({
      id: String(item.id || uid("contrib")),
      date: String(item.date || todayISO()),
      amount: round2(parseFloatSafe(item.amount, 0)),
      portfolioDate: String(item.portfolioDate || item.date || todayISO()),
      portfolioValue: round2(parseFloatSafe(item.portfolioValue, 0)),
      flow: round2(parseFloatSafe(item.flow, parseFloatSafe(item.amount, 0))),
    }))
    .filter((item) => item.portfolioValue > 0);
}

function syncBudgetFromCategories(targetState: State): void {
  (["income", "expense", "investment"] as BudgetType[]).forEach((type) => {
    const categories =
      type === "income"
        ? targetState.incomeCategories
        : type === "expense"
          ? targetState.expenseCategories
          : targetState.investmentCategories;

    categories.forEach((category) => {
      if (!targetState.budget[type][category]) {
        targetState.budget[type][category] = Array.from({ length: 12 }, () => 0);
      }
    });

    Object.keys(targetState.budget[type]).forEach((category) => {
      targetState.budget[type][category] = Array.from({ length: 12 }, (_, idx) =>
        round2(parseFloatSafe(targetState.budget[type][category][idx], 0))
      );
    });
  });
}

function supportsIndexedDb(): boolean {
  return typeof window !== "undefined" && typeof window.indexedDB !== "undefined";
}

function openIndexedDb(): Promise<IDBDatabase> {
  return new Promise((resolve, reject) => {
    const request = window.indexedDB.open(INDEXED_DB_NAME, INDEXED_DB_VERSION);

    request.onupgradeneeded = () => {
      const db = request.result;
      if (!db.objectStoreNames.contains(INDEXED_DB_STORE)) {
        db.createObjectStore(INDEXED_DB_STORE);
      }
    };

    request.onsuccess = () => {
      resolve(request.result);
    };

    request.onerror = () => {
      reject(request.error || new Error("IndexedDB open error"));
    };
  });
}

function readIndexedDbValue(db: IDBDatabase, key: string): Promise<unknown> {
  return new Promise((resolve, reject) => {
    const tx = db.transaction(INDEXED_DB_STORE, "readonly");
    const store = tx.objectStore(INDEXED_DB_STORE);
    const request = store.get(key);

    request.onsuccess = () => {
      resolve(request.result);
    };
    request.onerror = () => {
      reject(request.error || new Error("IndexedDB read error"));
    };
  });
}

function writeIndexedDbValue(db: IDBDatabase, key: string, value: unknown): Promise<void> {
  return new Promise((resolve, reject) => {
    const tx = db.transaction(INDEXED_DB_STORE, "readwrite");
    const store = tx.objectStore(INDEXED_DB_STORE);
    const request = store.put(value, key);

    request.onsuccess = () => {
      resolve();
    };
    request.onerror = () => {
      reject(request.error || new Error("IndexedDB write error"));
    };
  });
}

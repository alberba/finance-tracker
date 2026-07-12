import { FINANCE_TRACKER_SEED } from "../data/seed";
import {
  DEFAULT_GOALS,
  isInvestmentSide,
  isTransactionType,
  type BudgetType,
  type Contribution,
  type Entity,
  type Goal,
  type GoalKey,
  type SnapshotRow,
  type State,
  type Subscription,
  type Transaction,
  isSubscriptionFrequency,
} from "./types";
import {
  clamp,
  monthFromISO,
  parseFloatSafe,
  parseIntSafe,
  round2,
  slug,
  todayISO,
  uid,
} from "./utils";
import {
  deriveContributionFlow,
  deriveDefaultLiquidityAccountIds,
  sanitizeFlowAllocations,
} from "./contribution-workflow";

export const STORAGE_KEY = "finance-tracker-state-v1";
export const SERVER_STATE_ENDPOINT = "/api/state";

const FALLBACK_BASE_SEED = {
  meta: {
    source: "manual",
    generatedAt: new Date().toISOString(),
    version: 1,
    savedAt: null,
  },
  year: new Date().getFullYear(),
  currency: "EUR",
  twrLiquidityAccountIds: [],
  accounts: [],
  investmentAssets: [],
  liabilities: [],
  incomeCategories: ["Nómina", "Extra"],
  expenseCategories: ["Comida", "Vivienda"],
  investmentCategories: ["Fondos Indexados"],
  transactions: [],
  subscriptions: [],
  snapshots: {},
  budget: { income: {}, expense: {}, investment: {} },
  goals: {},
  contributions: [],
};

export const BASE_SEED: unknown = FINANCE_TRACKER_SEED || FALLBACK_BASE_SEED;

type UnknownRecord = Record<string, unknown>;

function asRecord(value: unknown): UnknownRecord {
  return typeof value === "object" && value !== null
    ? (value as UnknownRecord)
    : {};
}

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

export async function loadServerState(): Promise<unknown | null> {
  if (typeof fetch !== "function") {
    return null;
  }

  try {
    const response = await fetch(SERVER_STATE_ENDPOINT, {
      method: "GET",
      headers: buildServerHeaders(false),
    });
    if (!response.ok) {
      return null;
    }
    const data = (await response.json()) as { state?: unknown };
    return data?.state ?? null;
  } catch {
    return null;
  }
}

export async function persistServerState(state: State): Promise<boolean> {
  try {
    const response = await fetch(SERVER_STATE_ENDPOINT, {
      method: "PUT",
      headers: buildServerHeaders(true),
      body: JSON.stringify({ state }),
    });
    return response.ok;
  } catch {
    return false;
  }
}

export function normalizeState(candidate: unknown): State {
  const input = asRecord(candidate);
  const base = asRecord(BASE_SEED);
  const inputMeta = asRecord(input.meta);
  const baseMeta = asRecord(base.meta);
  const accounts = normalizeEntities(input?.accounts || base.accounts || []);
  const twrLiquidityAccountIds = normalizeTwrLiquidityAccountIds(
    input?.twrLiquidityAccountIds ?? base?.twrLiquidityAccountIds,
    accounts,
  );

  const baseYear = parseIntSafe(base.year, new Date().getFullYear());
  const year = parseIntSafe(input.year, baseYear);
  const safe: State = {
    meta: {
      source: String(inputMeta.source || baseMeta.source || "manual"),
      generatedAt:
        String(inputMeta.generatedAt || baseMeta.generatedAt || "") ||
        new Date().toISOString(),
      version: 1,
      savedAt: inputMeta.savedAt ? String(inputMeta.savedAt) : null,
    },
    year,
    currency: String(input?.currency || base.currency || "EUR")
      .toUpperCase()
      .slice(0, 3),
    twrLiquidityAccountIds,
    accounts,
    investmentAssets: normalizeEntities(
      input?.investmentAssets || base.investmentAssets || [],
    ),
    liabilities: normalizeEntities(
      input?.liabilities || base.liabilities || [],
    ),
    incomeCategories: normalizeStringList(
      input?.incomeCategories || base.incomeCategories || [],
    ),
    expenseCategories: normalizeStringList(
      input?.expenseCategories || base.expenseCategories || [],
    ),
    investmentCategories: normalizeStringList(
      input?.investmentCategories || base.investmentCategories || [],
    ),
    transactions: normalizeTransactions(
      input?.transactions || base.transactions || [],
    ),
    subscriptions: normalizeSubscriptions(input?.subscriptions || base.subscriptions || []),
    snapshots: normalizeSnapshots(input?.snapshots || base.snapshots || {}),
    budget: normalizeBudget(input?.budget || base.budget || {}),
    goals: normalizeGoals(input?.goals || base.goals || {}, year),
    contributions: normalizeContributions(
      input?.contributions || base.contributions || [],
    ),
  };

  if (!safe.investmentCategories.length) {
    safe.investmentCategories = safe.investmentAssets.map(
      (asset) => asset.name,
    );
  }

  syncBudgetFromCategories(safe);
  sortTransactionsInState(safe);
  sortContributionsInState(safe);

  return safe;
}

function normalizeTwrLiquidityAccountIds(
  input: unknown,
  accounts: State["accounts"],
): string[] {
  const validAccountIds = new Set(
    accounts.map((account) => String(account.id)),
  );
  const configured = Array.isArray(input) ? input : [];
  const normalizedConfigured = Array.from(
    new Set(
      configured
        .map((item) => String(item || "").trim())
        .filter((item) => validAccountIds.has(item)),
    ),
  );

  if (normalizedConfigured.length > 0) {
    return normalizedConfigured;
  }

  return deriveDefaultLiquidityAccountIds(accounts).filter((accountId) =>
    validAccountIds.has(accountId),
  );
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
    const byDate = String(a.portfolioDate || a.date).localeCompare(
      String(b.portfolioDate || b.date),
    );
    if (byDate !== 0) {
      return byDate;
    }
    return String(a.id).localeCompare(String(b.id));
  });
}

function normalizeEntities(list: unknown): Entity[] {
  const items = Array.isArray(list) ? list : [];
  return items
    .map((item) => {
      const rawItem = asRecord(item);
      return {
        id: slug(rawItem.id || rawItem.name || uid("item")),
        name: String(rawItem.name || rawItem.id || "Item"),
        openingBalance: round2(parseFloatSafe(rawItem.openingBalance, 0)),
      };
    })
    .filter((item) => item.name);
}

function normalizeStringList(list: unknown): string[] {
  const items = Array.isArray(list) ? list : [];
  return Array.from(
    new Set(
      items
        .map((item) => String(item || "").trim())
        .filter((item: string) => Boolean(item)),
    ),
  );
}

function normalizeTransactions(list: unknown): Transaction[] {
  const items = Array.isArray(list) ? list : [];
  return items
    .map((item) => {
      const rawItem = asRecord(item);
      const typeCandidate = String(rawItem.type || "");
      const type = isTransactionType(typeCandidate) ? typeCandidate : "expense";
      const amount = round2(parseFloatSafe(rawItem.amount, 0));
      const safe: Transaction = {
        id: String(rawItem.id || uid("tx")),
        date: String(rawItem.date || todayISO()),
        month: clamp(
          parseIntSafe(rawItem.month, monthFromISO(String(rawItem.date || "")) ?? 0),
          0,
          11,
        ),
        type,
        accountId: String(rawItem.accountId || ""),
        category: String(rawItem.category || "Sin categoría"),
        description: String(rawItem.description || ""),
        amount,
      };

      const subscriptionId = String(rawItem.subscriptionId || "").trim();
      const subscriptionChargeDate = String(rawItem.subscriptionChargeDate || "").trim();
      if (subscriptionId) {
        safe.subscriptionId = subscriptionId;
      }
      if (/^\d{4}-\d{2}-\d{2}$/.test(subscriptionChargeDate)) {
        safe.subscriptionChargeDate = subscriptionChargeDate;
      }

      if (type === "investment") {
        const time = normalizeTime(rawItem.time);
        const symbol = String(rawItem.symbol || "")
          .trim()
          .toUpperCase();
        const sideCandidate = String(rawItem.side || "").trim();
        const side = isInvestmentSide(sideCandidate)
          ? sideCandidate
          : amount < 0
            ? "sell"
            : "buy";
        const unitPrice = normalizeNonNegativeNumber(rawItem.unitPrice, 6);
        const units = normalizeNonNegativeNumber(rawItem.units, 8);
        const fee = normalizeNonNegativeNumber(rawItem.fee, 2);
        const movementCurrency = String(rawItem.movementCurrency || "")
          .trim()
          .toUpperCase()
          .slice(0, 3);

        if (time) {
          safe.time = time;
        }
        if (symbol) {
          safe.symbol = symbol;
        }
        safe.side = side;
        if (unitPrice !== null) {
          safe.unitPrice = unitPrice;
        }
        if (units !== null) {
          safe.units = units;
        }
        if (fee !== null) {
          safe.fee = fee;
        }
        if (movementCurrency) {
          safe.movementCurrency = movementCurrency;
        }
        safe.declared = Boolean(rawItem.declared);
      }

      return safe;
    })
    .filter((item) => Number.isFinite(item.amount) && item.amount !== 0);
}

function normalizeSubscriptions(list: unknown): Subscription[] {
  const items = Array.isArray(list) ? list : [];
  return items
    .map((item) => {
      const rawItem = asRecord(item);
      const frequencyCandidate = String(rawItem.frequency || "").trim();
      const frequency = isSubscriptionFrequency(frequencyCandidate)
        ? frequencyCandidate
        : "monthly";
      const startDate = String(rawItem.startDate || "").trim();
      const nextChargeDate = String(rawItem.nextChargeDate || startDate).trim();

      return {
        id: String(rawItem.id || uid("subscription")),
        name: String(rawItem.name || "Suscripción").trim(),
        amount: round2(parseFloatSafe(rawItem.amount, 0)),
        accountId: String(rawItem.accountId || "").trim(),
        category: String(rawItem.category || "Sin categoría").trim(),
        frequency,
        startDate,
        nextChargeDate,
        active: rawItem.active !== false,
      } satisfies Subscription;
    })
    .filter(
      (item) =>
        item.name &&
        item.amount > 0 &&
        /^\d{4}-\d{2}-\d{2}$/.test(item.startDate) &&
        /^\d{4}-\d{2}-\d{2}$/.test(item.nextChargeDate),
    );
}

function normalizeNonNegativeNumber(
  value: unknown,
  decimals: number,
): number | null {
  const parsed = roundWithPrecision(parseFloatSafe(value, NaN), decimals);
  if (!Number.isFinite(parsed) || parsed < 0) {
    return null;
  }
  return parsed;
}

function roundWithPrecision(value: number, decimals: number): number {
  const safeDecimals = Math.max(0, Math.min(10, Math.floor(decimals)));
  const factor = 10 ** safeDecimals;
  return Math.round((Number(value) || 0) * factor) / factor;
}

function normalizeTime(value: unknown): string {
  const input = String(value || "").trim();
  if (!/^\d{2}:\d{2}$/.test(input)) {
    return "";
  }
  const [hours, minutes] = input
    .split(":")
    .map((item) => parseIntSafe(item, -1));
  if (hours < 0 || hours > 23 || minutes < 0 || minutes > 59) {
    return "";
  }
  return `${String(hours).padStart(2, "0")}:${String(minutes).padStart(2, "0")}`;
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
  Object.entries((map || {}) as Record<string, unknown>).forEach(
    ([key, value]) => {
      const number = parseFloatSafe(value, NaN);
      if (!Number.isNaN(number)) {
        output[String(key)] = round2(number);
      }
    },
  );
  return output;
}

function normalizeBudget(budget: unknown): State["budget"] {
  const rawBudget = asRecord(budget);
  const safe: State["budget"] = {
    income: {},
    expense: {},
    investment: {},
  };

  (["income", "expense", "investment"] as BudgetType[]).forEach((type) => {
    Object.entries(asRecord(rawBudget[type])).forEach(([category, values]) => {
      const monthlyValues = Array.isArray(values) ? values : [];
      safe[type][category] = Array.from({ length: 12 }, (_, month) =>
        round2(parseFloatSafe(monthlyValues?.[month], 0)),
      );
    });
  });

  return safe;
}

function normalizeGoals(goals: unknown, year: number): Record<GoalKey, Goal> {
  const rawGoals = asRecord(goals);
  const defaults = DEFAULT_GOALS(year);
  const safe = {} as Record<GoalKey, Goal>;

  (Object.keys(defaults) as GoalKey[]).forEach((key) => {
    const rawGoal = asRecord(rawGoals[key]);
    safe[key] = {
      name: String(rawGoal.name || defaults[key].name),
      targetYear: parseIntSafe(
        rawGoal.targetYear,
        defaults[key].targetYear,
      ),
      targetAmount: round2(
        parseFloatSafe(
          rawGoal.targetAmount,
          defaults[key].targetAmount,
        ),
      ),
    };
  });

  return safe;
}

function normalizeContributions(list: unknown): Contribution[] {
  const items = Array.isArray(list) ? list : [];
  return items
    .map((item) => {
      const rawItem = asRecord(item);
      const normalizedAllocations = sanitizeFlowAllocations(
        rawItem.flowAllocations || [],
      );
      const derived = deriveContributionFlow({
        ...rawItem,
        flowAllocations: normalizedAllocations,
      });

      return {
        id: String(rawItem.id || uid("contrib")),
        date: String(rawItem.date || todayISO()),
        amount: round2(parseFloatSafe(rawItem.amount, 0)),
        portfolioDate: String(rawItem.portfolioDate || rawItem.date || todayISO()),
        portfolioValue: round2(parseFloatSafe(rawItem.portfolioValue, 0)),
        flow: round2(derived.flow),
        flowAllocations: normalizedAllocations,
        flowSource: derived.flowSource,
        warnings: Array.isArray(rawItem.warnings)
          ? rawItem.warnings
              .map((entry: unknown) => String(entry || "").trim())
              .filter(Boolean)
          : [],
      } satisfies Contribution;
    })
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
        targetState.budget[type][category] = Array.from(
          { length: 12 },
          () => 0,
        );
      }
    });

    Object.keys(targetState.budget[type]).forEach((category) => {
      targetState.budget[type][category] = Array.from(
        { length: 12 },
        (_, idx) =>
          round2(parseFloatSafe(targetState.budget[type][category][idx], 0)),
      );
    });
  });
}

function buildServerHeaders(withJsonBody: boolean): HeadersInit {
  const headers: Record<string, string> = {
    Accept: "application/json",
  };

  if (withJsonBody) {
    headers["Content-Type"] = "application/json";
  }

  const namespace = resolveRuntimeNamespace();
  if (namespace) {
    headers["x-finance-namespace"] = namespace;
  }

  return headers;
}

function resolveRuntimeNamespace(): string {
  if (typeof window === "undefined") {
    return "";
  }

  const candidate = String(
    (window as Window & { __FINANCE_NAMESPACE__?: string })
      .__FINANCE_NAMESPACE__ || "",
  )
    .trim()
    .toLowerCase();
  if (!candidate) {
    return "";
  }

  const safe = candidate.replace(/[^a-z0-9_-]/g, "").slice(0, 64);
  return safe;
}

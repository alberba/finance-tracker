import { FINANCE_TRACKER_SEED } from "../data/seed";
import { FINANCE_TRACKER_DEMO_SEED } from "../data/demo-seed";
import { isDemoMode } from "./demo-mode";
import {
  DEFAULT_GOALS,
  isInvestmentSide,
  isTransactionType,
  type BudgetType,
  type Contribution,
  type Entity,
  type Goal,
  type GoalKey,
  type Instrument,
  type InstrumentType,
  type PendingMovement,
  type PendingMovementStatus,
  type Quote,
  type QuoteStatus,
  type RecurringFrequency,
  type RecurringRule,
  type SnapshotRow,
  type State,
  type StockEventsSettings,
  type StockEventsSymbolMapping,
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
import { isSyncV2Enabled } from "../lib/client/feature-flags";

export const STORAGE_KEY = "finance-tracker-state-v1";
export const SERVER_STATE_ENDPOINT = "/api/state";
/** Last server `version` this client has confirmed, for optimistic concurrency. */
export const SERVER_VERSION_KEY = "finance-tracker-server-version-v1";
/** Set while localStorage holds edits not yet confirmed by the server. */
export const PENDING_CHANGES_KEY = "finance-tracker-pending-v1";

export interface ServerState {
  state: unknown;
  version: number;
}

export type ServerSaveResult =
  | { status: "ok"; version: number }
  | { status: "conflict"; version: number; state: unknown }
  | { status: "error" };

export function getKnownServerVersion(): number | null {
  try {
    const raw = localStorage.getItem(storageKey(SERVER_VERSION_KEY));
    if (raw === null) {
      return null;
    }
    const value = Number(raw);
    return Number.isFinite(value) ? value : null;
  } catch {
    return null;
  }
}

export function setKnownServerVersion(version: number | null): void {
  try {
    if (version === null) {
      localStorage.removeItem(storageKey(SERVER_VERSION_KEY));
    } else {
      localStorage.setItem(storageKey(SERVER_VERSION_KEY), String(version));
    }
  } catch {
    /* storage unavailable — best effort */
  }
}

export function hasPendingChanges(): boolean {
  try {
    return localStorage.getItem(storageKey(PENDING_CHANGES_KEY)) === "1";
  } catch {
    return false;
  }
}

export function setPendingChanges(pending: boolean): void {
  try {
    if (pending) {
      localStorage.setItem(storageKey(PENDING_CHANGES_KEY), "1");
    } else {
      localStorage.removeItem(storageKey(PENDING_CHANGES_KEY));
    }
  } catch {
    /* storage unavailable — best effort */
  }
}

export const EMPTY_STATE_SEED = {
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
  categoryEmojis: {},
  transactions: [],
  subscriptions: [],
  snapshots: {},
  budget: { income: {}, expense: {}, investment: {} },
  goals: {},
  contributions: [],
  instruments: [],
  quotes: {},
  recurringRules: [],
  pendingMovements: [],
  stockEvents: {
    enabled: false,
    apiKey: "",
    tradesToCash: false,
    symbolMappings: [],
    cashMappings: [],
    cashSyncEntries: [],
  },
};

export const BASE_SEED: unknown = isDemoMode()
  ? FINANCE_TRACKER_DEMO_SEED
  : FINANCE_TRACKER_SEED || EMPTY_STATE_SEED;

/**
 * En modo demo cada clave de localStorage lleva un sufijo propio: así ni se
 * lee la caché con datos reales ni las ediciones de la demo la contaminan.
 */
function storageKey(base: string): string {
  return isDemoMode() ? `${base}::demo` : base;
}

type UnknownRecord = Record<string, unknown>;

function asRecord(value: unknown): UnknownRecord {
  return typeof value === "object" && value !== null
    ? (value as UnknownRecord)
    : {};
}

export function loadPersistedState(): unknown | null {
  try {
    const raw = localStorage.getItem(storageKey(STORAGE_KEY));
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
  localStorage.setItem(storageKey(STORAGE_KEY), JSON.stringify(state));
  return state.meta.savedAt;
}

export async function loadServerState(): Promise<ServerState | null> {
  if (isDemoMode() || isSyncV2Enabled() || typeof fetch !== "function") {
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
    const data = (await response.json()) as {
      state?: unknown;
      version?: unknown;
    };
    if (data?.state == null) {
      return null;
    }
    const version = typeof data.version === "number" ? data.version : 0;
    setKnownServerVersion(version);
    return { state: data.state, version };
  } catch {
    return null;
  }
}

/**
 * Pushes `state` to the server using the last known version as the concurrency
 * base. Returns a structured result so callers can react to conflicts and
 * transient failures instead of the previous silently-swallowed boolean.
 */
export async function persistServerState(
  state: State,
): Promise<ServerSaveResult> {
  const knownVersion = getKnownServerVersion();
  if (isDemoMode() || isSyncV2Enabled()) {
    return { status: "ok", version: knownVersion ?? 0 };
  }
  try {
    const response = await fetch(SERVER_STATE_ENDPOINT, {
      method: "PUT",
      headers: buildServerHeaders(true),
      body: JSON.stringify({
        state,
        ...(knownVersion !== null ? { baseVersion: knownVersion } : {}),
      }),
    });

    if (response.status === 409) {
      const data = (await response.json()) as {
        state?: unknown;
        version?: unknown;
      };
      const version = typeof data.version === "number" ? data.version : 0;
      setKnownServerVersion(version);
      return { status: "conflict", version, state: data.state ?? null };
    }

    if (!response.ok) {
      return { status: "error" };
    }

    const data = (await response.json()) as { version?: unknown };
    const version =
      typeof data.version === "number" ? data.version : (knownVersion ?? 0) + 1;
    setKnownServerVersion(version);
    // NOTE: the caller clears the pending flag, not us — only it knows whether
    // newer local edits arrived while this request was in flight (still dirty).
    return { status: "ok", version };
  } catch {
    return { status: "error" };
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
    categoryEmojis: normalizeCategoryEmojis(
      input?.categoryEmojis || base.categoryEmojis || {},
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
    instruments: normalizeInstruments(input?.instruments || base.instruments || []),
    quotes: normalizeQuotes(input?.quotes || base.quotes || {}),
    recurringRules: normalizeRecurringRules(
      input?.recurringRules || base.recurringRules || [],
    ),
    pendingMovements: normalizePendingMovements(
      input?.pendingMovements || base.pendingMovements || [],
    ),
    stockEvents: normalizeStockEvents(input?.stockEvents || base.stockEvents),
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

function normalizeInstruments(list: unknown): Instrument[] {
  const items = Array.isArray(list) ? list : [];
  const validTypes: InstrumentType[] = ["stock", "etf", "fund", "crypto"];
  return items
    .map((item) => {
      const raw = asRecord(item);
      const typeCandidate = String(raw.type || "stock");
      const type = validTypes.includes(typeCandidate as InstrumentType)
        ? (typeCandidate as InstrumentType)
        : "stock";
      const symbol = String(raw.symbol || "").trim().toUpperCase();
      return {
        id: slug(raw.id || `${raw.investmentAssetId || "instrument"}-${symbol}`),
        investmentAssetId: String(raw.investmentAssetId || ""),
        type,
        symbol,
        market: String(raw.market || "").trim().toUpperCase(),
        currency: String(raw.currency || "EUR").trim().toUpperCase().slice(0, 3),
        provider: String(raw.provider || "twelve-data").trim().toLowerCase(),
        active: raw.active !== false,
        openingUnits: roundWithPrecision(parseFloatSafe(raw.openingUnits, 0), 8),
        ...(raw.holdingUnits !== undefined
          ? { holdingUnits: roundWithPrecision(parseFloatSafe(raw.holdingUnits, 0), 8) }
          : {}),
        ...(raw.holdingsAsOf ? { holdingsAsOf: String(raw.holdingsAsOf) } : {}),
        ...(raw.holdingsUpdatedAt ? { holdingsUpdatedAt: String(raw.holdingsUpdatedAt) } : {}),
        ...(raw.holdingsSource === 'manual' ? { holdingsSource: 'manual' as const } : {}),
      } satisfies Instrument;
    })
    .filter((instrument) => instrument.symbol && instrument.investmentAssetId);
}

function normalizeQuotes(input: unknown): Record<string, Quote> {
  const source = asRecord(input);
  const output: Record<string, Quote> = {};
  Object.entries(source).forEach(([instrumentId, value]) => {
    const raw = asRecord(value);
    const statusCandidate = String(raw.status || (raw.isStale ? "stale" : "fresh"));
    const statuses: QuoteStatus[] = ["fresh", "stale", "unavailable"];
    const status = statuses.includes(statusCandidate as QuoteStatus)
      ? (statusCandidate as QuoteStatus)
      : "unavailable";
    const price = parseFloatSafe(raw.price, NaN);
    if (!Number.isFinite(price) || price < 0) return;
    output[instrumentId] = {
      instrumentId: String(raw.instrumentId || instrumentId),
      price: round2(price),
      currency: String(raw.currency || "EUR").trim().toUpperCase().slice(0, 3),
      timestamp: String(raw.timestamp || ""),
      source: String(raw.source || "unknown"),
      status,
      isStale: status !== "fresh" || raw.isStale === true,
      previousClose: normalizeOptionalNumber(raw.previousClose),
      changePercent: normalizeOptionalNumber(raw.changePercent),
    } satisfies Quote;
  });
  return output;
}

function normalizeRecurringRules(list: unknown): RecurringRule[] {
  const items = Array.isArray(list) ? list : [];
  const frequencies: RecurringFrequency[] = ["daily", "weekly", "monthly", "monthEnd", "yearly"];
  return items.map((item) => {
    const raw = asRecord(item);
    const frequencyCandidate = String(raw.frequency || "monthly");
    const frequency = frequencies.includes(frequencyCandidate as RecurringFrequency)
      ? (frequencyCandidate as RecurringFrequency)
      : "monthly";
    const type = isTransactionType(String(raw.type || "expense"))
      ? String(raw.type) as RecurringRule["type"]
      : "expense";
    // Investment quantities and prices need more precision than currency
    // amounts. Keep the same limits used by transaction normalization so
    // fractional crypto holdings survive a state hydration round-trip.
    const units = normalizeNonNegativeNumber(raw.units, 8);
    const unitPrice = normalizeNonNegativeNumber(raw.unitPrice, 6);
    const fee = normalizeNonNegativeNumber(raw.fee, 2);
    const time = normalizeTime(raw.time);
    return {
      id: String(raw.id || uid("rule")),
      type,
      accountId: String(raw.accountId || ""),
      category: String(raw.category || "Sin categoría"),
      description: String(raw.description || ""),
      amount: round2(parseFloatSafe(raw.amount, 0)),
      ...(String(raw.symbol || "").trim() ? { symbol: String(raw.symbol).trim().toUpperCase() } : {}),
      ...(isInvestmentSide(String(raw.side || "")) ? { side: String(raw.side) as "buy" | "sell" } : {}),
      ...(units !== null ? { units } : {}),
      ...(unitPrice !== null ? { unitPrice } : {}),
      ...(fee !== null ? { fee } : {}),
      ...(time ? { time } : {}),
      frequency,
      interval: Math.max(1, parseIntSafe(raw.interval, 1)),
      startDate: String(raw.startDate || todayISO()),
      endDate: raw.endDate ? String(raw.endDate) : null,
      active: raw.active !== false,
      lastExecutionDate: raw.lastExecutionDate ? String(raw.lastExecutionDate) : null,
      nextOccurrenceDate: raw.nextOccurrenceDate ? String(raw.nextOccurrenceDate) : null,
    } satisfies RecurringRule;
  });
}

function normalizePendingMovements(list: unknown): PendingMovement[] {
  const items = Array.isArray(list) ? list : [];
  const statuses: PendingMovementStatus[] = ["pending", "confirmed", "skipped", "cancelled"];
  return items.map((item) => {
    const raw = asRecord(item);
    const statusCandidate = String(raw.status || "pending");
    const status = statuses.includes(statusCandidate as PendingMovementStatus)
      ? (statusCandidate as PendingMovementStatus)
      : "pending";
    // Pending automated investments are hydrated before confirmation. Do not
    // round their fractional titles to the two decimals used by money values.
    const units = normalizeNonNegativeNumber(raw.units, 8);
    const unitPrice = normalizeNonNegativeNumber(raw.unitPrice, 6);
    const fee = normalizeNonNegativeNumber(raw.fee, 2);
    const time = normalizeTime(raw.time);
    return {
      id: String(raw.id || uid("pending")),
      occurrenceKey: String(raw.occurrenceKey || `${raw.ruleId || "rule"}:${raw.occurrenceDate || todayISO()}`),
      ruleId: String(raw.ruleId || ""),
      occurrenceDate: String(raw.occurrenceDate || todayISO()),
      type: isTransactionType(String(raw.type || "expense"))
        ? String(raw.type) as PendingMovement["type"]
        : "expense",
      accountId: String(raw.accountId || ""),
      category: String(raw.category || "Sin categoría"),
      description: String(raw.description || ""),
      amount: round2(parseFloatSafe(raw.amount, 0)),
      ...(String(raw.symbol || "").trim() ? { symbol: String(raw.symbol).trim().toUpperCase() } : {}),
      ...(isInvestmentSide(String(raw.side || "")) ? { side: String(raw.side) as "buy" | "sell" } : {}),
      ...(units !== null ? { units } : {}),
      ...(unitPrice !== null ? { unitPrice } : {}),
      ...(fee !== null ? { fee } : {}),
      ...(time ? { time } : {}),
      status,
      createdAt: String(raw.createdAt || new Date().toISOString()),
      updatedAt: String(raw.updatedAt || raw.createdAt || new Date().toISOString()),
      transactionId: raw.transactionId ? String(raw.transactionId) : null,
    } satisfies PendingMovement;
  });
}

function normalizeStockEvents(input: unknown): StockEventsSettings {
  const raw = asRecord(input);
  const rawMappings = Array.isArray(raw.symbolMappings) ? raw.symbolMappings : [];
  const seen = new Set<string>();
  const symbolMappings: StockEventsSymbolMapping[] = [];
  rawMappings.forEach((item) => {
    const mapping = asRecord(item);
    const symbol = String(mapping.symbol || "").trim().toUpperCase();
    if (!symbol || seen.has(symbol)) {
      return;
    }
    seen.add(symbol);
    symbolMappings.push({
      symbol,
      sync: mapping.sync === true,
      watchlistId: String(mapping.watchlistId || "").trim(),
      targetSymbol: String(mapping.targetSymbol || "").trim().toUpperCase(),
      hidden: mapping.hidden === true,
    });
  });
  const rawCashMappings = Array.isArray(raw.cashMappings) ? raw.cashMappings : [];
  const seenAccounts = new Set<string>();
  const cashMappings = rawCashMappings.flatMap((item) => {
    const mapping = asRecord(item);
    const accountId = String(mapping.accountId || "").trim();
    const watchlistId = String(mapping.watchlistId || "").trim();
    if (!accountId || !watchlistId || seenAccounts.has(accountId)) {
      return [];
    }
    seenAccounts.add(accountId);
    return [{ accountId, watchlistId }];
  });
  const rawCashSyncEntries = Array.isArray(raw.cashSyncEntries) ? raw.cashSyncEntries : [];
  const seenCashSyncEntries = new Set<string>();
  const cashSyncEntries = rawCashSyncEntries.flatMap((item) => {
    const entry = asRecord(item);
    const contributionDate = String(entry.contributionDate || "").trim();
    const accountId = String(entry.accountId || "").trim();
    const watchlistId = String(entry.watchlistId || "").trim();
    const syncedAmount = round2(parseFloatSafe(entry.syncedAmount, NaN));
    const key = `${contributionDate}:${accountId}:${watchlistId}`;
    if (
      !/^\d{4}-\d{2}-\d{2}$/.test(contributionDate) ||
      !accountId ||
      !watchlistId ||
      !Number.isFinite(syncedAmount) ||
      seenCashSyncEntries.has(key)
    ) {
      return [];
    }
    seenCashSyncEntries.add(key);
    return [{ contributionDate, accountId, watchlistId, syncedAmount }];
  });
  return {
    enabled: raw.enabled === true,
    apiKey: String(raw.apiKey || "").trim(),
    tradesToCash: raw.tradesToCash === true,
    symbolMappings,
    cashMappings,
    cashSyncEntries,
  };
}

function normalizeOptionalNumber(value: unknown): number | null {
  const parsed = parseFloatSafe(value, NaN);
  return Number.isFinite(parsed) && parsed >= 0 ? round2(parsed) : null;
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

const MAX_CATEGORY_EMOJI_LENGTH = 8;

function normalizeCategoryEmojis(input: unknown): Record<string, string> {
  const record = asRecord(input);
  const result: Record<string, string> = {};

  for (const [key, value] of Object.entries(record)) {
    const cleanKey = String(key || "").trim();
    const cleanValue = String(value || "")
      .trim()
      .slice(0, MAX_CATEGORY_EMOJI_LENGTH);
    if (cleanKey && cleanValue) {
      result[cleanKey] = cleanValue;
    }
  }

  return result;
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
      if (rawItem.createdAt) {
        safe.createdAt = String(rawItem.createdAt);
      }

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
        const instrumentId = String(rawItem.instrumentId || '').trim();
        if (instrumentId) {
          safe.instrumentId = instrumentId;
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

  return headers;
}

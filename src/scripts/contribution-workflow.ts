import type { Contribution, Entity } from "./types";
import { parseFloatSafe, round2 } from "./utils";

export interface ContributionFlowAllocation {
  accountId: string;
  amount: number;
}

export const LIQUIDITY_TARGET_KEYS = ["myinvestor", "trading212", "traderepublic"] as const;

const LIQUIDITY_TARGET_LABELS: Record<(typeof LIQUIDITY_TARGET_KEYS)[number], string> = {
  myinvestor: "MyInvestor",
  trading212: "Trading 212",
  traderepublic: "Trade Republic",
};

export function normalizeLiquidityName(value: unknown): string {
  return String(value || "")
    .toLowerCase()
    .replace(/[^a-z0-9]/g, "");
}

export function getLiquidityTargetLabel(key: string): string {
  const normalized = normalizeLiquidityName(key) as (typeof LIQUIDITY_TARGET_KEYS)[number];
  return LIQUIDITY_TARGET_LABELS[normalized] || String(key || "");
}

function resolveLiquidityAccountsFromConfiguredIds(accounts: Entity[], configuredAccountIds: string[]): {
  matched: Entity[];
  missing: string[];
} {
  const uniqueIds = Array.from(
    new Set(
      configuredAccountIds
        .map((item) => String(item || "").trim())
        .filter(Boolean)
    )
  );
  const byId = new Map(accounts.map((account) => [String(account.id), account] as const));
  const matched: Entity[] = [];
  const missing: string[] = [];

  uniqueIds.forEach((accountId) => {
    const account = byId.get(accountId);
    if (!account) {
      missing.push(getLiquidityTargetLabel(accountId));
      return;
    }
    matched.push(account);
  });

  return { matched, missing };
}

export function findLiquidityTargets(accounts: Entity[]): {
  matched: Entity[];
  missing: string[];
};

export function findLiquidityTargets(accounts: Entity[], configuredAccountIds: string[]): {
  matched: Entity[];
  missing: string[];
};

export function findLiquidityTargets(accounts: Entity[], configuredAccountIds: string[] = []): {
  matched: Entity[];
  missing: string[];
} {
  if (configuredAccountIds.length > 0) {
    return resolveLiquidityAccountsFromConfiguredIds(accounts, configuredAccountIds);
  }

  const byKey = new Map<string, Entity>();

  accounts.forEach((account) => {
    const key = normalizeLiquidityName(account.name || account.id);
    if (!key || byKey.has(key)) {
      return;
    }
    byKey.set(key, account);
  });

  const matched: Entity[] = [];
  const missing: string[] = [];

  LIQUIDITY_TARGET_KEYS.forEach((targetKey) => {
    const exact = byKey.get(targetKey);
    if (exact) {
      matched.push(exact);
      return;
    }

    const partial = Array.from(byKey.entries()).find(([key]) => key.includes(targetKey) || targetKey.includes(key));
    if (partial) {
      matched.push(partial[1]);
      return;
    }

    missing.push(getLiquidityTargetLabel(targetKey));
  });

  return { matched, missing };
}

export function deriveDefaultLiquidityAccountIds(accounts: Entity[]): string[] {
  return findLiquidityTargets(accounts).matched.map((account) => String(account.id));
}

export function sanitizeFlowAllocations(list: unknown): ContributionFlowAllocation[] {
  const items = Array.isArray(list) ? list : [];
  return items
    .map((item: any) => ({
      accountId: String(item?.accountId || "").trim(),
      amount: round2(parseFloatSafe(item?.amount, 0)),
    }))
    .filter((item) => item.accountId && Number.isFinite(item.amount) && item.amount > 0);
}

export function getFlowFromAllocations(list: unknown): number {
  return round2(sanitizeFlowAllocations(list).reduce((sum, item) => sum + item.amount, 0));
}

export function deriveContributionFlow(contribution: Partial<Contribution>): {
  flow: number;
  flowSource: "legacy" | "allocations";
  allocations: ContributionFlowAllocation[];
} {
  const allocations = sanitizeFlowAllocations(contribution.flowAllocations || []);
  const allocatedFlow = getFlowFromAllocations(allocations);

  if (allocatedFlow > 0) {
    return {
      flow: allocatedFlow,
      flowSource: "allocations",
      allocations,
    };
  }

  return {
    flow: round2(parseFloatSafe(contribution.flow, parseFloatSafe(contribution.amount, 0))),
    flowSource: contribution.flowSource === "allocations" ? "allocations" : "legacy",
    allocations,
  };
}

export function toSnapshotDate(year: number, month: number): string {
  const day = new Date(year, month + 1, 0).getDate();
  return `${year}-${String(month + 1).padStart(2, "0")}-${String(day).padStart(2, "0")}`;
}

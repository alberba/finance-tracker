import { ALL_MONTHS, type Month, type MonthOrStart } from './month'
import { round2 } from "./number";

export { round2 };

export type TxType = "income" | "expense" | "saving" | "investment";

export interface Transaction {
  id: string;
  date: string;
  month: Month;
  type: TxType;
  accountId: string;
  destinationAccountId?: string;
  category: string;
  description?: string;
  amount: number;
}

export interface Entity {
  id: string;
  name: string;
  openingBalance: number;
}

export interface Snapshot {
  month: Month;
  accounts: Record<string, number>;
  investments: Record<string, number>;
  liabilities: Record<string, number>;
}

export interface ContributionEntry {
  id: string;
  date: string;
  amount: number;
  portfolioDate: string;
  portfolioValue: number;
  flow: number;
}

export interface ContributionMetric extends ContributionEntry {
  nav: number;
  unitsBefore: number;
  unitsAfter: number;
  periodReturn: number | null;
  cumulativeReturn: number | null;
}

export interface WealthSnapshot {
  liquidity: number;
  investment: number;
  liabilities: number;
  net: number;
}

export function slug(value: string): string {
  return (
    String(value || "")
      .toLowerCase()
      .trim()
      .replace(/[^a-z0-9]+/g, "-")
      .replace(/^-+|-+$/g, "") || "item"
  );
}

export function getMonthTotals(
  transactions: Transaction[],
  month: Month,
): {
  income: number;
  expense: number;
  saving: number;
  investment: number;
} {
  return transactions
    .filter((item) => Number(item.month) === month)
    .reduce(
      (acc, item) => {
        const amount = Number(item.amount || 0);
        if (item.type === "income") {
          acc.income += amount;
        }
        if (item.type === "expense") {
          acc.expense += amount;
        }
        if (item.type === "saving") {
          acc.saving += amount;
        }
        if (item.type === "investment") {
          acc.investment += amount;
        }
        return acc;
      },
      { income: 0, expense: 0, saving: 0, investment: 0 },
    );
}

export function getCategoryActuals(
  transactions: Transaction[],
  type: TxType,
  month: Month,
  categories: string[],
): Record<string, number> {
  const map: Record<string, number> = {};

  categories.forEach((category) => {
    map[category] = 0;
  });

  transactions
    .filter((item) => Number(item.month) === month && item.type === type)
    .forEach((item) => {
      if (!map[item.category]) {
        map[item.category] = 0;
      }
      map[item.category] += Number(item.amount || 0);
    });

  Object.keys(map).forEach((key) => {
    map[key] = round2(map[key]);
  });

  return map;
}

export function getSnapshotValue(
  snapshots: Record<string, Snapshot>,
  kind: "accounts" | "investments" | "liabilities",
  month: Month,
  itemId: string,
): number | null {
  const snapshot = snapshots[String(month)];
  if (!snapshot || !snapshot[kind]) {
    return null;
  }
  const raw = snapshot[kind][itemId];
  return Number.isFinite(Number(raw)) ? Number(raw) : null;
}

function getLatestSnapshotValue(
  snapshots: Record<string, Snapshot>,
  kind: "accounts" | "investments" | "liabilities",
  itemId: string,
  month: MonthOrStart,
): { month: Month; value: number } | null {
  for (const m of ALL_MONTHS.filter((candidate) => candidate <= month).reverse()) {
    const value = getSnapshotValue(snapshots, kind, m, itemId);
    if (value !== null) {
      return { month: m, value };
    }
  }
  return null;
}

export function computeAccountBalance(
  accountId: string,
  month: MonthOrStart,
  accounts: Entity[],
  transactions: Transaction[],
  snapshots: Record<string, Snapshot>,
): number {
  const account = accounts.find((item) => item.id === accountId);
  if (!account) {
    return 0;
  }

  const latestSnapshot = getLatestSnapshotValue(
    snapshots,
    "accounts",
    accountId,
    month,
  );
  let startMonth = 0; // before January: no snapshot yet
  let balance = Number(account.openingBalance || 0);

  if (latestSnapshot) {
    startMonth = latestSnapshot.month;
    balance = latestSnapshot.value;
  }

  transactions.forEach((item) => {
    const isOrigin = item.accountId === accountId;
    // A saving also lands in its destination account (ADR 0007).
    const isDestination = item.type === "saving" && item.destinationAccountId === accountId;
    if (!isOrigin && !isDestination) {
      return;
    }
    const txMonth = Number(item.month);
    if (txMonth <= startMonth || txMonth > month) {
      return;
    }

    const amount = Number(item.amount || 0);
    if (item.type === "saving") {
      // Moves between cash accounts: out of the origin, into the destination, net worth unchanged.
      if (isOrigin) balance -= amount;
      if (isDestination) balance += amount;
    } else if (item.type === "income") {
      balance += amount;
    } else if (item.type === "expense" || item.type === "investment") {
      balance -= amount;
    }
  });

  return round2(balance);
}

export function matchesInvestmentAsset(category: string, asset: Entity): boolean {
  if (!category || !asset) {
    return false;
  }
  const categorySlug = slug(category);
  return (
    categorySlug === asset.id ||
    category.toLowerCase() === String(asset.name || "").toLowerCase()
  );
}

export function computeInvestmentValue(
  assetId: string,
  month: MonthOrStart,
  assets: Entity[],
  transactions: Transaction[],
  snapshots: Record<string, Snapshot>,
): number {
  const asset = assets.find((item) => item.id === assetId);
  if (!asset) {
    return 0;
  }

  const latestSnapshot = getLatestSnapshotValue(
    snapshots,
    "investments",
    assetId,
    month,
  );
  let startMonth = 0; // before January: no snapshot yet
  let value = Number(asset.openingBalance || 0);

  if (latestSnapshot) {
    startMonth = latestSnapshot.month;
    value = latestSnapshot.value;
  }

  transactions.forEach((item) => {
    if (item.type !== "investment") {
      return;
    }
    const txMonth = Number(item.month);
    if (txMonth <= startMonth || txMonth > month) {
      return;
    }
    if (!matchesInvestmentAsset(item.category, asset)) {
      return;
    }
    value += Number(item.amount || 0);
  });

  return round2(value);
}

export function computeLiabilityValue(
  liabilityId: string,
  month: MonthOrStart,
  liabilities: Entity[],
  snapshots: Record<string, Snapshot>,
): number {
  const liability = liabilities.find((item) => item.id === liabilityId);
  if (!liability) {
    return 0;
  }

  const latestSnapshot = getLatestSnapshotValue(
    snapshots,
    "liabilities",
    liabilityId,
    month,
  );
  if (latestSnapshot) {
    return round2(latestSnapshot.value);
  }

  return round2(Number(liability.openingBalance || 0));
}

export function getWealthByMonth(
  month: MonthOrStart,
  accounts: Entity[],
  investmentAssets: Entity[],
  liabilities: Entity[],
  transactions: Transaction[],
  snapshots: Record<string, Snapshot>,
): WealthSnapshot {
  const liquidity = accounts.reduce(
    (sum, item) =>
      sum +
      computeAccountBalance(item.id, month, accounts, transactions, snapshots),
    0,
  );
  const investment = investmentAssets.reduce(
    (sum, item) =>
      sum +
      computeInvestmentValue(
        item.id,
        month,
        investmentAssets,
        transactions,
        snapshots,
      ),
    0,
  );
  const liabilitiesValue = liabilities.reduce(
    (sum, item) =>
      sum + computeLiabilityValue(item.id, month, liabilities, snapshots),
    0,
  );

  return {
    liquidity: round2(liquidity),
    investment: round2(investment),
    liabilities: round2(liabilitiesValue),
    net: round2(liquidity + investment - liabilitiesValue),
  };
}

export function computeContributionMetrics(
  entries: ContributionEntry[],
): ContributionMetric[] {
  const sorted = [...entries].sort((a, b) =>
    String(a.portfolioDate || a.date).localeCompare(
      String(b.portfolioDate || b.date),
    ),
  );

  if (!sorted.length) {
    return [];
  }

  const rows: ContributionMetric[] = [];
  const baseNav = 100;
  let prevNav = baseNav;
  let prevUnits = 0;

  sorted.forEach((item, index) => {
    const portfolioValue = Number.isFinite(Number(item.portfolioValue))
      ? Number(item.portfolioValue)
      : 0;
    const flow = Number.isFinite(Number(item.flow))
      ? Number(item.flow)
      : Number(item.amount || 0);

    let nav: number;
    let unitsBefore: number;
    let unitsAfter: number;
    let periodReturn: number | null;
    let cumulativeReturn: number | null;

    if (index === 0) {
      nav = baseNav;
      unitsBefore = portfolioValue > 0 ? portfolioValue / nav : 0;
      unitsAfter = nav > 0 ? unitsBefore + flow / nav : unitsBefore;
      periodReturn = null;
      cumulativeReturn = null;
    } else {
      unitsBefore = prevUnits;
      nav = unitsBefore > 0 ? portfolioValue / unitsBefore : prevNav;
      if (!Number.isFinite(nav) || nav <= 0) {
        nav = prevNav;
      }
      unitsAfter = nav > 0 ? unitsBefore + flow / nav : unitsBefore;
      periodReturn = prevNav > 0 ? nav / prevNav - 1 : 0;
      cumulativeReturn = baseNav > 0 ? nav / baseNav - 1 : 0;
    }

    if (!Number.isFinite(unitsAfter)) {
      unitsAfter = unitsBefore;
    }

    rows.push({
      ...item,
      amount: round2(item.amount),
      portfolioValue: round2(portfolioValue),
      flow: round2(flow),
      nav,
      unitsBefore,
      unitsAfter,
      periodReturn,
      cumulativeReturn,
    });

    prevNav = nav;
    prevUnits = unitsAfter;
  });

  return rows;
}

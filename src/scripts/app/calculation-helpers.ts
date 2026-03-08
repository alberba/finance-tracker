import { MONTHS, type BudgetType, type MonthTotals, type SnapshotKind, type State, type TransactionType } from "../types";
import { monthFromISO, round2, slug } from "../utils";

interface AppCalculationHelpersDeps {
  getState: () => State;
  getFallbackMonth: () => number;
}

export function setupAppCalculationHelpers(deps: AppCalculationHelpersDeps) {
  function getCategoriesForType(type: BudgetType): string[] {
    const state = deps.getState();
    if (type === "income") {
      return state.incomeCategories;
    }
    if (type === "expense") {
      return state.expenseCategories;
    }
    return state.investmentCategories;
  }

  function getOrderedCategoriesForType(type: BudgetType): string[] {
    const state = deps.getState();
    const categories = getCategoriesForType(type);
    if (type !== "expense") {
      return categories;
    }

    const usageByCategory = state.transactions.reduce(
      (acc: Record<string, number>, tx: { type?: TransactionType; category?: string }) => {
        if (tx.type !== "expense") {
          return acc;
        }
        const category = String(tx.category || "").trim();
        if (!category) {
          return acc;
        }
        acc[category] = (acc[category] || 0) + 1;
        return acc;
      },
      {}
    );

    return [...categories].sort((a, b) => {
      const usageA = usageByCategory[a] || 0;
      const usageB = usageByCategory[b] || 0;
      if (usageA !== usageB) {
        return usageB - usageA;
      }
      return categories.indexOf(a) - categories.indexOf(b);
    });
  }

  function getMonthTotals(month: number): MonthTotals {
    const state = deps.getState();
    return state.transactions
      .filter((item: any) => Number(item.month) === month)
      .reduce(
        (acc: any, item: any) => {
          if (item.type === "income") {
            acc.income += Number(item.amount || 0);
          }
          if (item.type === "expense") {
            acc.expense += Number(item.amount || 0);
          }
          if (item.type === "investment") {
            acc.investment += Number(item.amount || 0);
          }
          return acc;
        },
        { income: 0, expense: 0, investment: 0 }
      );
  }

  function getYearTotals(): MonthTotals {
    return MONTHS.map((_, month) => getMonthTotals(month)).reduce(
      (acc: any, item: any) => {
        acc.income += item.income;
        acc.expense += item.expense;
        acc.investment += item.investment;
        return acc;
      },
      { income: 0, expense: 0, investment: 0 }
    );
  }

  function getMonthlyCashflowSeries() {
    const income: number[] = [];
    const expense: number[] = [];
    const investment: number[] = [];

    MONTHS.forEach((_, month) => {
      const total = getMonthTotals(month);
      income.push(round2(total.income));
      expense.push(round2(total.expense));
      investment.push(round2(total.investment));
    });

    return { income, expense, investment };
  }

  function getCategoryActuals(type: BudgetType, month: number): Record<string, number> {
    const state = deps.getState();
    const map: Record<string, number> = {};

    getCategoriesForType(type).forEach((category: any) => {
      map[category] = 0;
    });

    state.transactions
      .filter((item: any) => Number(item.month) === month && item.type === type)
      .forEach((item: any) => {
        if (!map[item.category]) {
          map[item.category] = 0;
        }
        map[item.category] += Number(item.amount || 0);
      });

    Object.keys(map).forEach((key: any) => {
      map[key] = round2(map[key]);
    });

    return map;
  }

  function ensureBudgetCategory(type: BudgetType, category: string) {
    const state = deps.getState();
    if (!state.budget[type]) {
      state.budget[type] = {};
    }
    if (!state.budget[type][category]) {
      state.budget[type][category] = Array.from({ length: 12 }, () => 0);
    }
    if (state.budget[type][category].length < 12) {
      const missing = 12 - state.budget[type][category].length;
      state.budget[type][category].push(...Array.from({ length: missing }, () => 0));
    }
  }

  function getBudgetValue(type: BudgetType, category: string, month: number) {
    const state = deps.getState();
    ensureBudgetCategory(type, category);
    return round2(state.budget[type][category][month] || 0);
  }

  function getSnapshotValue(kind: SnapshotKind, month: number, itemId: string) {
    const state = deps.getState();
    const snapshot = state.snapshots[String(month)];
    if (!snapshot || !snapshot[kind]) {
      return null;
    }
    const raw = snapshot[kind][itemId];
    return Number.isFinite(Number(raw)) ? Number(raw) : null;
  }

  function getLatestSnapshotValue(kind: SnapshotKind, itemId: string, month: number) {
    for (let m = month; m >= 0; m -= 1) {
      const value = getSnapshotValue(kind, m, itemId);
      if (value !== null) {
        return { month: m, value };
      }
    }
    return null;
  }

  function getAccountName(accountId: any) {
    const state = deps.getState();
    const account = state.accounts.find((item: any) => item.id === accountId);
    return account ? account.name : accountId || "-";
  }

  function isBitvavoBrokerAccount(accountId: string): boolean {
    const state = deps.getState();
    const account = state.accounts.find((item: any) => item.id === accountId);
    const accountName = String(account?.name || "").trim().toLowerCase();
    return accountName === "bitvavo";
  }

  function resolveInvestmentCategory(accountId: string, rawCategory: string, fallbackCategory: string): string {
    if (isBitvavoBrokerAccount(accountId)) {
      return "Crypto";
    }

    const normalized = String(rawCategory || "").trim();
    if (normalized) {
      return normalized;
    }

    return String(fallbackCategory || "Sin categoría").trim() || "Sin categoría";
  }

  function computeAccountBalance(accountId: any, month: any) {
    const state = deps.getState();
    const account = state.accounts.find((item: any) => item.id === accountId);
    if (!account) {
      return 0;
    }

    const latestSnapshot = getLatestSnapshotValue("accounts", accountId, month);
    let startMonth = -1;
    let balance = Number(account.openingBalance || 0);

    if (latestSnapshot) {
      startMonth = latestSnapshot.month;
      balance = latestSnapshot.value;
    }

    state.transactions.forEach((item: any) => {
      if (item.accountId !== accountId) {
        return;
      }
      const txMonth = Number(item.month);
      if (txMonth <= startMonth || txMonth > month) {
        return;
      }
      const amount = Number(item.amount || 0);
      if (item.type === "income") {
        balance += amount;
      } else if (item.type === "expense" || item.type === "investment") {
        balance -= amount;
      }
    });

    return round2(balance);
  }

  function matchesInvestmentAsset(category: any, asset: any) {
    if (!category || !asset) {
      return false;
    }
    const catSlug = slug(category);
    return catSlug === asset.id || category.toLowerCase() === String(asset.name || "").toLowerCase();
  }

  function computeInvestmentValue(assetId: any, month: any) {
    const state = deps.getState();
    const asset = state.investmentAssets.find((item: any) => item.id === assetId);
    if (!asset) {
      return 0;
    }

    const latestSnapshot = getLatestSnapshotValue("investments", assetId, month);
    let startMonth = -1;
    let value = Number(asset.openingBalance || 0);

    if (latestSnapshot) {
      startMonth = latestSnapshot.month;
      value = latestSnapshot.value;
    }

    state.transactions.forEach((item: any) => {
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

  function computeLiabilityValue(liabilityId: any, month: any) {
    const state = deps.getState();
    const liability = state.liabilities.find((item: any) => item.id === liabilityId);
    if (!liability) {
      return 0;
    }

    const latestSnapshot = getLatestSnapshotValue("liabilities", liabilityId, month);
    if (latestSnapshot) {
      return round2(latestSnapshot.value);
    }

    return round2(Number(liability.openingBalance || 0));
  }

  function getWealthByMonth(month: any) {
    const state = deps.getState();
    const liquidity = state.accounts.reduce((sum: any, item: any) => sum + computeAccountBalance(item.id, month), 0);
    const investment = state.investmentAssets.reduce((sum: any, item: any) => sum + computeInvestmentValue(item.id, month), 0);
    const liabilities = state.liabilities.reduce((sum: any, item: any) => sum + computeLiabilityValue(item.id, month), 0);
    const net = liquidity + investment - liabilities;

    return {
      liquidity: round2(liquidity),
      investment: round2(investment),
      liabilities: round2(liabilities),
      net: round2(net),
    };
  }

  function getWealthSeries() {
    return MONTHS.map((_, month) => getWealthByMonth(month));
  }

  function getLatestDataMonth() {
    const state = deps.getState();
    let latest = -1;

    state.transactions.forEach((item: any) => {
      const month = Number(item.month);
      if (Number.isInteger(month) && month >= 0 && month < MONTHS.length) {
        latest = Math.max(latest, month);
      }
    });

    Object.keys(state.snapshots || {}).forEach((monthKey: any) => {
      const month = Number(monthKey);
      if (Number.isInteger(month) && month >= 0 && month < MONTHS.length) {
        latest = Math.max(latest, month);
      }
    });

    state.contributions.forEach((entry: any) => {
      const month = monthFromISO(entry.portfolioDate || entry.date);
      if (month !== null) {
        latest = Math.max(latest, month);
      }
    });

    if (latest >= 0) {
      return latest;
    }
    const fallbackMonth = deps.getFallbackMonth();
    if (MONTHS[fallbackMonth]) {
      return fallbackMonth;
    }
    return 0;
  }

  function computeInvestedCapital(month: any) {
    const state = deps.getState();
    const openingCapital = state.investmentAssets.reduce((sum: any, item: any) => sum + Number(item.openingBalance || 0), 0);
    const contributions = state.transactions
      .filter((item: any) => item.type === "investment" && Number(item.month) <= month)
      .reduce((sum: any, item: any) => sum + Number(item.amount || 0), 0);

    return round2(openingCapital + contributions);
  }

  return {
    getCategoriesForType,
    getOrderedCategoriesForType,
    getMonthTotals,
    getYearTotals,
    getMonthlyCashflowSeries,
    getCategoryActuals,
    ensureBudgetCategory,
    getBudgetValue,
    getSnapshotValue,
    getAccountName,
    isBitvavoBrokerAccount,
    resolveInvestmentCategory,
    computeAccountBalance,
    computeInvestmentValue,
    computeLiabilityValue,
    matchesInvestmentAsset,
    getWealthByMonth,
    getWealthSeries,
    getLatestDataMonth,
    computeInvestedCapital,
  };
}

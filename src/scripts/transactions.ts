import { parseFloatSafe, round2 } from "./utils";
import {
  type SortDirection,
  type Transaction,
  type TransactionType,
  type TxSortColumn,
} from "./types";

export interface TransactionFilters {
  date: string;
  accountIds: string[];
  types: string[];
  category: string;
  description: string;
  amountMin: string;
  amountMax: string;
}

export interface TransactionSort {
  column: TxSortColumn;
  direction: SortDirection;
}

export interface AccountOption {
  value: string;
  label: string;
}

export interface CategoryAmountRow {
  category: string;
  amount: number;
}

export interface MonthBreakdown {
  totals: Record<TransactionType, number>;
  byType: Record<TransactionType, CategoryAmountRow[]>;
}

export function filterAndSortTransactions(params: {
  transactions: Transaction[];
  month: number;
  filters: TransactionFilters;
  sort: TransactionSort;
  getAccountName: (accountId: string) => string;
}): Transaction[] {
  const { transactions, month, filters, sort, getAccountName } = params;
  const amountMin =
    filters.amountMin === "" ? null : parseFloatSafe(filters.amountMin, NaN);
  const amountMax =
    filters.amountMax === "" ? null : parseFloatSafe(filters.amountMax, NaN);
  const categoryQuery = filters.category.toLowerCase();
  const descriptionQuery = filters.description.toLowerCase();

  const filtered = transactions.filter((item) => {
    if (Number(item.month) !== month) {
      return false;
    }
    if (filters.date && String(item.date) !== filters.date) {
      return false;
    }
    if (
      filters.accountIds.length > 0 &&
      !filters.accountIds.includes(String(item.accountId))
    ) {
      return false;
    }
    if (
      filters.types.length > 0 &&
      !filters.types.includes(String(item.type))
    ) {
      return false;
    }
    if (
      categoryQuery &&
      !String(item.category || "")
        .toLowerCase()
        .includes(categoryQuery)
    ) {
      return false;
    }
    if (
      descriptionQuery &&
      !String(item.description || "")
        .toLowerCase()
        .includes(descriptionQuery)
    ) {
      return false;
    }
    if (
      amountMin !== null &&
      Number.isFinite(amountMin) &&
      Number(item.amount || 0) < amountMin
    ) {
      return false;
    }
    if (
      amountMax !== null &&
      Number.isFinite(amountMax) &&
      Number(item.amount || 0) > amountMax
    ) {
      return false;
    }
    return true;
  });

  const sortDir = sort.direction === "asc" ? 1 : -1;
  return filtered.sort((a, b) => {
    if (sort.column === "date") {
      return String(a.date).localeCompare(String(b.date)) * sortDir;
    }
    if (sort.column === "amount") {
      return (Number(a.amount || 0) - Number(b.amount || 0)) * sortDir;
    }
    if (sort.column === "account") {
      return (
        getAccountName(a.accountId).localeCompare(
          getAccountName(b.accountId),
          "es",
        ) * sortDir
      );
    }
    if (sort.column === "type") {
      return String(a.type).localeCompare(String(b.type), "es") * sortDir;
    }
    if (sort.column === "category") {
      return (
        String(a.category || "").localeCompare(String(b.category || ""), "es") *
        sortDir
      );
    }
    if (sort.column === "description") {
      return (
        String(a.description || "").localeCompare(
          String(b.description || ""),
          "es",
        ) * sortDir
      );
    }
    return String(b.date).localeCompare(String(a.date));
  });
}

export function buildAccountFilterOptions(params: {
  transactions: Transaction[];
  month: number;
  getAccountName: (accountId: string) => string;
}): AccountOption[] {
  const { transactions, month, getAccountName } = params;
  const monthTransactions = transactions.filter(
    (item) => Number(item.month) === month,
  );
  const accountIds = Array.from(
    new Set(monthTransactions.map((item) => item.accountId).filter(Boolean)),
  );

  return accountIds
    .map((accountId) => ({
      value: accountId,
      label: getAccountName(accountId),
    }))
    .sort((a, b) => a.label.localeCompare(b.label, "es"));
}

export function buildMonthBreakdown(params: {
  transactions: Transaction[];
  month: number;
  incomeCategories: string[];
  expenseCategories: string[];
  investmentCategories: string[];
}): MonthBreakdown {
  const {
    transactions,
    month,
    incomeCategories,
    expenseCategories,
    investmentCategories,
  } = params;

  const categoriesByType: Record<TransactionType, string[]> = {
    income: incomeCategories,
    expense: expenseCategories,
    investment: investmentCategories,
  };

  const byTypeMap: Record<TransactionType, Map<string, number>> = {
    income: createCategoryMap(categoriesByType.income),
    expense: createCategoryMap(categoriesByType.expense),
    investment: createCategoryMap(categoriesByType.investment),
  };
  const totals: Record<TransactionType, number> = {
    income: 0,
    expense: 0,
    investment: 0,
  };

  transactions.forEach((item) => {
    if (Number(item.month) !== month) {
      return;
    }
    const type = item.type;
    const category = String(item.category || "Sin categoría");
    const amount = Number(item.amount || 0);
    const map = byTypeMap[type];
    map.set(category, round2((map.get(category) || 0) + amount));
    totals[type] = round2(totals[type] + amount);
  });

  return {
    totals,
    byType: {
      income: toSortedCategoryRows(byTypeMap.income, "amount-desc"),
      expense: toSortedCategoryRows(byTypeMap.expense, "amount-desc"),
      investment: toSortedCategoryRows(byTypeMap.investment, "amount-desc"),
    },
  };
}

function createCategoryMap(categories: string[]): Map<string, number> {
  const map = new Map<string, number>();
  categories.forEach((category) => {
    const normalized = String(category || "").trim();
    if (!normalized) {
      return;
    }
    map.set(normalized, 0);
  });
  return map;
}

function toSortedCategoryRows(
  map: Map<string, number>,
  sortMode: "alpha" | "amount-desc",
): CategoryAmountRow[] {
  return Array.from(map.entries())
    .sort((a, b) => {
      if (sortMode === "amount-desc") {
        const amountDiff = b[1] - a[1];
        if (amountDiff !== 0) {
          return amountDiff;
        }
      }
      return a[0].localeCompare(b[0], "es");
    })
    .map(([category, amount]) => ({
      category,
      amount: round2(amount),
    }));
}

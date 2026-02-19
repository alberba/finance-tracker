import { parseFloatSafe } from "./utils";
import { type SortDirection, type Transaction, type TxSortColumn } from "./types";

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

export function filterAndSortTransactions(params: {
  transactions: Transaction[];
  month: number;
  filters: TransactionFilters;
  sort: TransactionSort;
  getAccountName: (accountId: string) => string;
}): Transaction[] {
  const { transactions, month, filters, sort, getAccountName } = params;
  const amountMin = filters.amountMin === "" ? null : parseFloatSafe(filters.amountMin, NaN);
  const amountMax = filters.amountMax === "" ? null : parseFloatSafe(filters.amountMax, NaN);
  const categoryQuery = filters.category.toLowerCase();
  const descriptionQuery = filters.description.toLowerCase();

  const filtered = transactions.filter((item) => {
    if (Number(item.month) !== month) {
      return false;
    }
    if (filters.date && String(item.date) !== filters.date) {
      return false;
    }
    if (filters.accountIds.length > 0 && !filters.accountIds.includes(String(item.accountId))) {
      return false;
    }
    if (filters.types.length > 0 && !filters.types.includes(String(item.type))) {
      return false;
    }
    if (categoryQuery && !String(item.category || "").toLowerCase().includes(categoryQuery)) {
      return false;
    }
    if (descriptionQuery && !String(item.description || "").toLowerCase().includes(descriptionQuery)) {
      return false;
    }
    if (amountMin !== null && Number.isFinite(amountMin) && Number(item.amount || 0) < amountMin) {
      return false;
    }
    if (amountMax !== null && Number.isFinite(amountMax) && Number(item.amount || 0) > amountMax) {
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
      return getAccountName(a.accountId).localeCompare(getAccountName(b.accountId), "es") * sortDir;
    }
    if (sort.column === "type") {
      return String(a.type).localeCompare(String(b.type), "es") * sortDir;
    }
    if (sort.column === "category") {
      return String(a.category || "").localeCompare(String(b.category || ""), "es") * sortDir;
    }
    if (sort.column === "description") {
      return String(a.description || "").localeCompare(String(b.description || ""), "es") * sortDir;
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
  const monthTransactions = transactions.filter((item) => Number(item.month) === month);
  const accountIds = Array.from(new Set(monthTransactions.map((item) => item.accountId).filter(Boolean)));

  return accountIds
    .map((accountId) => ({ value: accountId, label: getAccountName(accountId) }))
    .sort((a, b) => a.label.localeCompare(b.label, "es"));
}

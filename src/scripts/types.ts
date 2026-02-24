export const TRANSACTION_TYPES = ["income", "expense", "investment"] as const;
export type TransactionType = (typeof TRANSACTION_TYPES)[number];
export type BudgetType = TransactionType;
export type TxSortColumn = "date" | "amount" | "account" | "type" | "category" | "description";
export type SortDirection = "asc" | "desc";
export type SnapshotKind = "accounts" | "investments" | "liabilities";
export type EntityKey = "accounts" | "investmentAssets" | "liabilities";
export type CategoryKey = "incomeCategories" | "expenseCategories" | "investmentCategories";
export type GoalKey = "short" | "medium" | "long" | "investmentTotal" | "investmentFunds" | "investmentCrypto";

export interface Entity {
  id: string;
  name: string;
  openingBalance: number;
}

export interface Transaction {
  id: string;
  date: string;
  month: number;
  type: TransactionType;
  accountId: string;
  category: string;
  description: string;
  amount: number;
}

export interface SnapshotRow {
  month: number;
  accounts: Record<string, number>;
  investments: Record<string, number>;
  liabilities: Record<string, number>;
}

export interface Goal {
  name: string;
  targetYear: number;
  targetAmount: number;
}

export type GoalField = keyof Goal;

export interface Contribution {
  id: string;
  date: string;
  amount: number;
  portfolioDate: string;
  portfolioValue: number;
  flow: number;
}

export interface StateMeta {
  source: string;
  generatedAt: string;
  version: number;
  savedAt: string | null;
}

export interface State {
  meta: StateMeta;
  year: number;
  currency: string;
  accounts: Entity[];
  investmentAssets: Entity[];
  liabilities: Entity[];
  incomeCategories: string[];
  expenseCategories: string[];
  investmentCategories: string[];
  transactions: Transaction[];
  snapshots: Record<string, SnapshotRow>;
  budget: Record<BudgetType, Record<string, number[]>>;
  goals: Record<GoalKey, Goal>;
  contributions: Contribution[];
}

export interface MonthTotals {
  income: number;
  expense: number;
  investment: number;
}

export interface ContributionMetricRow {
  id: string;
  date: string;
  amount: number;
  portfolioValue: number;
  flow: number;
  nav: number;
  periodReturn: number;
  cumulativeReturn: number;
}

export const MONTHS = [
  "ENERO",
  "FEBRERO",
  "MARZO",
  "ABRIL",
  "MAYO",
  "JUNIO",
  "JULIO",
  "AGOSTO",
  "SEPTIEMBRE",
  "OCTUBRE",
  "NOVIEMBRE",
  "DICIEMBRE",
] as const;

export const SECTION_ROUTE_MAP = {
  dashboard: "/dashboard",
  transactions: "/movimientos",
  budget: "/presupuesto",
  wealth: "/patrimonio",
  investment: "/inversion",
  goals: "/objetivos",
  settings: "/configuracion",
  data: "/datos",
  reports: "/reportes",
} as const;

export type SectionId = keyof typeof SECTION_ROUTE_MAP;

export const ROUTE_SECTION_MAP: Record<string, SectionId> = Object.fromEntries(
  Object.entries(SECTION_ROUTE_MAP).map(([sectionId, routePath]) => [routePath, sectionId])
) as Record<string, SectionId>;

const GOAL_KEYS = ["short", "medium", "long", "investmentTotal", "investmentFunds", "investmentCrypto"] as const;
const GOAL_FIELDS = ["name", "targetYear", "targetAmount"] as const;
const ENTITY_KEYS = ["accounts", "investmentAssets", "liabilities"] as const;
const CATEGORY_KEYS = ["incomeCategories", "expenseCategories", "investmentCategories"] as const;
const SNAPSHOT_KINDS = ["accounts", "investments", "liabilities"] as const;

export const DEFAULT_GOALS = (year: number): Record<GoalKey, Goal> => ({
  short: { name: "Objetivo corto plazo", targetYear: year, targetAmount: 10000 },
  medium: { name: "Objetivo medio plazo", targetYear: year + 1, targetAmount: 50000 },
  long: { name: "Objetivo largo plazo", targetYear: year + 4, targetAmount: 150000 },
  investmentTotal: { name: "Objetivo inversión total", targetYear: year + 1, targetAmount: 50000 },
  investmentFunds: { name: "Objetivo fondos indexados", targetYear: year + 1, targetAmount: 50000 },
  investmentCrypto: { name: "Objetivo criptomonedas", targetYear: year + 1, targetAmount: 15000 },
});

export function isSectionId(value: string): value is SectionId {
  return Object.prototype.hasOwnProperty.call(SECTION_ROUTE_MAP, value);
}

export function isEntityKey(value: string): value is EntityKey {
  return (ENTITY_KEYS as readonly string[]).includes(value);
}

export function isCategoryKey(value: string): value is CategoryKey {
  return (CATEGORY_KEYS as readonly string[]).includes(value);
}

export function isBudgetType(value: string): value is BudgetType {
  return (TRANSACTION_TYPES as readonly string[]).includes(value);
}

export function isSnapshotKind(value: string): value is SnapshotKind {
  return (SNAPSHOT_KINDS as readonly string[]).includes(value);
}

export function isTransactionType(value: string): value is TransactionType {
  return (TRANSACTION_TYPES as readonly string[]).includes(value);
}

export function isGoalKey(value: string): value is GoalKey {
  return (GOAL_KEYS as readonly string[]).includes(value);
}

export function isGoalField(value: string): value is GoalField {
  return (GOAL_FIELDS as readonly string[]).includes(value);
}

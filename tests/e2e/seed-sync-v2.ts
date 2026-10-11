import { createRequire } from 'node:module'
import type { APIRequestContext } from '@playwright/test'

const require = createRequire(import.meta.url)
const seed = require('../../src/data/seed.json') as {
  currency: string
  year: number
  accounts: Array<{ id: string; name: string; openingBalance: number }>
  investmentAssets: Array<{ id: string; name: string; openingBalance: number }>
  liabilities: Array<{ id: string; name: string; openingBalance: number }>
  incomeCategories: string[]
  expenseCategories: string[]
  investmentCategories: string[]
  transactions: Array<{
    id: string
    accountId: string
    category: string
    type: string
    date: string
    description: string
    amount: number
  }>
  budget: Record<string, Record<string, number[]>>
  snapshots: Record<
    string,
    {
      month: number
      accounts: Record<string, number>
      investments: Record<string, number>
      liabilities: Record<string, number>
    }
  >
  goals: Record<string, { name: string; targetYear: number; targetAmount: number }>
  contributions: Array<{
    id: string
    date: string
    amount: number
    portfolioDate: string
    portfolioValue: number
    flow: number
    flowAllocations: Array<{ accountId: string; amount: number }>
  }>
}

const currency = seed.currency

function buildSeedExport() {
  const accounts = [
    ...seed.accounts.map((account) => ({ ...account, kind: 'cash' })),
    ...seed.investmentAssets.map((account) => ({ ...account, kind: 'investment' })),
    ...seed.liabilities.map((account) => ({ ...account, kind: 'liability' })),
  ].map((account) => ({
    id: account.id,
    legacyId: account.id,
    name: account.name,
    kind: account.kind,
    currency,
    openingBalance: account.openingBalance,
    isArchived: false,
  }))

  const categories = [
    ...seed.incomeCategories.map((name, sortOrder) => ({ name, kind: 'income', sortOrder })),
    ...seed.expenseCategories.map((name, sortOrder) => ({ name, kind: 'expense', sortOrder })),
    ...seed.investmentCategories.map((name, sortOrder) => ({
      name,
      kind: 'investment',
      sortOrder,
    })),
  ].map((category, index) => ({ ...category, id: `seed-category-${index}`, legacyId: null }))
  const categoryIds = new Map(
    categories.map((category) => [`${category.kind}:${category.name}`, category.id]),
  )

  const budgetEntries = Object.entries(seed.budget).flatMap(([kind, byCategory]) =>
    Object.entries(byCategory).flatMap(([name, amounts]) =>
      amounts.map((amount, month) => ({
        legacyId: null,
        categoryId: categoryIds.get(`${kind}:${name}`),
        year: seed.year,
        month: month + 1,
        amount,
        currency,
      })),
    ),
  )

  const wealthSnapshots = Object.values(seed.snapshots).map((snapshot) => ({
    id: `seed-snapshot-${snapshot.month}`,
    legacyId: null,
    snapshotDate: `${seed.year}-${String(snapshot.month + 1).padStart(2, '0')}-01`,
    year: seed.year,
    month: snapshot.month + 1,
    balances: Object.entries({
      ...snapshot.accounts,
      ...snapshot.investments,
      ...snapshot.liabilities,
    }).map(([accountId, balance]) => ({
      accountId,
      balance,
      currency,
    })),
  }))

  return {
    format: 'finance-tracker/v2-export',
    exportedAt: '2026-01-01T00:00:00.000Z',
    userId: 'e2e-seed',
    settings: { currency },
    accounts,
    categories,
    twrLiquidityAccounts: [],
    transactions: seed.transactions.map((transaction) => ({
      id: transaction.id,
      legacyId: transaction.id,
      accountId: transaction.accountId,
      categoryId: categoryIds.get(`${transaction.type}:${transaction.category}`) ?? null,
      type: transaction.type,
      date: transaction.date,
      description: transaction.description,
      amount: transaction.amount,
      currency,
      declared: false,
      operation: null,
    })),
    subscriptions: [],
    recurringRules: [],
    pendingMovements: [],
    budgetEntries,
    goals: Object.entries(seed.goals).map(([key, goal]) => ({
      legacyId: null,
      key,
      ...goal,
      currency,
    })),
    wealthSnapshots,
    contributions: seed.contributions.map((contribution) => ({
      ...contribution,
      legacyId: contribution.id,
      currency,
      allocations: contribution.flowAllocations.map((allocation) => ({
        accountId: allocation.accountId,
        amount: allocation.amount,
        currency,
      })),
    })),
    userInstruments: [],
    stockeventsSymbolMappings: [],
    stockeventsCashMappings: [],
    stockeventsCashSyncEntries: [],
  }
}

const seedExport = buildSeedExport()

/** Restores the app's existing finance scenario through the supported backup import API. */
export async function seedSyncV2User(request: APIRequestContext, email: string): Promise<void> {
  const response = await request.post('/api/data/import?mode=replace', {
    headers: { 'X-Test-User-Email': email },
    data: seedExport,
  })
  if (!response.ok()) {
    throw new Error(`No se pudo importar la semilla E2E sync-v2 (${response.status()})`)
  }
}

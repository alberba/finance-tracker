import { execFileSync } from 'node:child_process'
import { createRequire } from 'node:module'
import { expect, type APIRequestContext, type Page } from '@playwright/test'
import { normalizeState } from '../../src/scripts/state'
import type { State } from '../../src/scripts/types'
import { projectSyncV2State } from '../../src/lib/client/v2-state-projection'
import { FinanceTrackerPage } from './pages/FinanceTrackerPage'
import { categoryEmojiKey } from '../../src/scripts/category-emoji'

const require = createRequire(import.meta.url)
const seed = normalizeState(require('../../src/data/seed.json'))

function buildSeedExport(seed: State) {
  const currency = seed.currency
  const accountIds = new Set(
    [...seed.accounts, ...seed.investmentAssets, ...seed.liabilities].map((a) => a.id),
  )
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
  ].map((category, index) => ({
    ...category,
    id: `seed-category-${index}`,
    legacyId: null,
    emoji:
      seed.categoryEmojis[
        categoryEmojiKey(category.kind as 'income' | 'expense' | 'investment', category.name)
      ],
  }))
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
    })
      .filter(([id]) => accountIds.has(id))
      .map(([accountId, balance]) => ({
        accountId,
        balance,
        currency,
      })),
  }))

  return {
    format: 'finance-tracker/v2-export',
    exportedAt: '2026-01-01T00:00:00.000Z',
    userId: 'e2e-seed',
    settings: {
      currency,
      stockeventsEnabled: seed.stockEvents.enabled,
      stockeventsTradesToCash: seed.stockEvents.tradesToCash,
    },
    accounts,
    categories,
    twrLiquidityAccounts: seed.twrLiquidityAccountIds
      .filter((id) => accountIds.has(id))
      .map((accountId) => ({ accountId })),
    transactions: seed.transactions
      .filter((t) => accountIds.has(t.accountId))
      .map((transaction) => ({
        id: transaction.id,
        legacyId: transaction.id,
        accountId: transaction.accountId,
        categoryId: categoryIds.get(`${transaction.type}:${transaction.category}`) ?? null,
        type: transaction.type,
        date: transaction.date,
        description: transaction.description,
        amount: transaction.amount,
        currency,
        declared: transaction.declared,
        time: transaction.time,
        remoteOperation: transaction.remoteOperation,
        operation: transaction.side
          ? {
              side: transaction.side,
              symbol: transaction.symbol,
              units: transaction.units,
              unitPrice: transaction.unitPrice,
              fee: transaction.fee,
            }
          : null,
      })),
    subscriptions: seed.subscriptions.map((s) => ({
      ...s,
      legacyId: s.id,
      categoryId: categoryIds.get(`expense:${s.category}`),
      isActive: s.active,
      currency,
    })),
    recurringRules: seed.recurringRules.map((r) => ({
      ...r,
      legacyId: r.id,
      name: r.description,
      categoryId: categoryIds.get(`${r.type}:${r.category}`),
      nextRunDate: r.nextOccurrenceDate,
      status: r.active ? 'active' : 'paused',
      currency,
    })),
    pendingMovements: seed.pendingMovements.map((p) => ({
      ...p,
      legacyId: p.id,
      recurringRuleId: p.ruleId,
      categoryId: categoryIds.get(`${p.type}:${p.category}`),
      dueDate: p.occurrenceDate,
      currency,
    })),
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
      allocations: (contribution.flowAllocations ?? [])
        .filter((a) => accountIds.has(a.accountId))
        .map((allocation) => ({
          accountId: allocation.accountId,
          amount: allocation.amount,
          currency,
        })),
    })),
    userInstruments: seed.instruments.map((i) => ({
      instrumentId: i.id,
      alias: i.investmentAssetId,
    })),
    stockeventsSymbolMappings: seed.stockEvents.symbolMappings.map((m) => ({
      ...m,
      legacyId: m.symbol,
      stockeventsSymbol: m.targetSymbol || m.symbol,
    })),
    stockeventsCashMappings: seed.stockEvents.cashMappings,
    stockeventsCashSyncEntries: seed.stockEvents.cashSyncEntries,
  }
}

const seedExport = buildSeedExport(seed)

/** Restores the app's existing finance scenario through the supported backup import API. */
export async function seedSyncV2User(request: APIRequestContext, email: string): Promise<void> {
  const response = await request.post('/api/data/import?mode=replace', {
    headers: { 'X-Test-User-Email': email },
    data: seedExport,
  })
  expect(response.ok(), await response.text()).toBe(true)
  expect((await response.json()).skipped).toEqual({})
}

/** Reads the same bootstrap contract the authenticated application consumes. */
export async function readScenarioState(page: Page): Promise<State> {
  await new FinanceTrackerPage(page).waitForSync()
  const response = await page.request.get('/api/bootstrap')
  expect(response.ok()).toBe(true)
  return projectSyncV2State(await response.json())
}

/** Installs scenario edits through the existing backup contract, then reloads the app. */
export async function editScenarioState(page: Page, edit: (state: State) => void): Promise<void> {
  const state = await readScenarioState(page)
  edit(state)
  if (state.instruments.length) {
    // The global catalogue has no write API, as in seed-market-instrument.ts.
    const quoted = (value: string) => `'${value.replaceAll("'", "''")}'`
    const now = quoted(new Date().toISOString())
    const rows = state.instruments
      .map(
        (i) =>
          `(${[i.id, i.id, i.symbol, i.symbol.trim().toUpperCase(), 'e2e-' + i.id, i.symbol, i.type, i.currency].map(quoted).join(',')},${now},${now})`,
      )
      .join(',')
    execFileSync(
      'pnpm',
      [
        'exec',
        'wrangler',
        'd1',
        'execute',
        'finance-tracker-db-v2',
        '--local',
        '--persist-to',
        '.wrangler/state',
        '--command',
        `INSERT OR IGNORE INTO market_instruments (id,legacy_id,symbol,normalized_symbol,provider,name,asset_class,currency,created_at,updated_at) VALUES ${rows}`,
      ],
      { stdio: 'pipe' },
    )
  }
  const response = await page.request.post('/api/data/import?mode=replace', {
    data: buildSeedExport(state),
  })
  expect(response.ok(), await response.text()).toBe(true)
  expect((await response.json()).skipped).toEqual({})
  await new FinanceTrackerPage(page).reload()
}

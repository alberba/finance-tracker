import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import type { AuthPrincipal } from '../../../../src/lib/server/auth/principal'
import * as accountsRepository from '../../../../src/db/repositories/accounts'
import * as transactionsRepository from '../../../../src/db/repositories/transactions'
import * as integrationCredentialsRepository from '../../../../src/db/repositories/integration-credentials'
import * as recurringRulesRepository from '../../../../src/db/repositories/recurring-rules'
import * as pendingMovementsRepository from '../../../../src/db/repositories/pending-movements'
import * as subscriptionsRepository from '../../../../src/db/repositories/subscriptions'
import * as budgetEntriesRepository from '../../../../src/db/repositories/budget-entries'
import { runWithDb } from '../../../../src/db/database'
import * as goalsRepository from '../../../../src/db/repositories/goals'
import * as wealthRepository from '../../../../src/db/repositories/wealth'
import * as contributionsRepository from '../../../../src/db/repositories/contributions'
import * as marketRepository from '../../../../src/db/repositories/market'
import * as stockeventsSymbolMappingsRepository from '../../../../src/db/repositories/stockevents-symbol-mappings'
import * as stockeventsCashMappingsRepository from '../../../../src/db/repositories/stockevents-cash-mappings'
import * as syncRepository from '../../../../src/db/repositories/sync'
import * as userSettingsRepository from '../../../../src/db/repositories/user-settings'
import { createStatementRecorder, createTestDb, type TestDatabase } from '../setup'
import { seedUser } from '../repositories/fixtures'

let currentDb: TestDatabase['db']
vi.mock('../../../../src/db/client', () => ({
  getDb: () => currentDb,
}))

type Row = Record<string, unknown>

const VOLATILE_KEYS = new Set(['id', 'userId', 'createdAt', 'updatedAt', 'version', 'exportedAt'])

/**
 * An export with every server-minted id and timestamp removed and each
 * foreign key replaced by the name of the row it points at, so two exports
 * of the same data held by different users compare equal.
 */
function comparable(exported: Row): Row {
  const names = new Map<string, string>()
  for (const key of ['accounts', 'categories', 'recurringRules']) {
    for (const row of exported[key] as Row[]) names.set(String(row.id), String(row.name))
  }
  const strip = (value: unknown): unknown => {
    if (Array.isArray(value)) {
      return value.map(strip).sort((a, b) => JSON.stringify(a).localeCompare(JSON.stringify(b)))
    }
    if (!value || typeof value !== 'object') return value
    const out: Row = {}
    for (const [key, field] of Object.entries(value as Row)) {
      if (VOLATILE_KEYS.has(key) || key === 'snapshotId' || key === 'contributionId') continue
      out[key] =
        (['accountId', 'destinationAccountId', 'categoryId', 'recurringRuleId'].includes(key) ||
          (key === 'alias' && names.has(String(field)))) &&
        typeof field === 'string'
          ? `→${names.get(field) ?? '?'}`
          : strip(field)
    }
    return out
  }
  return strip(exported) as Row
}

/** One row in every collection the export carries, with the optional fields filled in. */
async function seedFullDataset(db: TestDatabase['db'], userId: string, symbol = 'VWCE'): Promise<void> {
  const account = await runWithDb(db, accountsRepository.create(userId, {
    name: 'Broker',
    kind: 'investment',
    currency: 'EUR',
    openingBalance: 100,
    isArchived: true,
  }))
  const category = await runWithDb(db, accountsRepository.createCategory(userId, {
    name: 'Ocio',
    kind: 'expense',
    sortOrder: 3,
    emoji: '🎬',
  }))
  await runWithDb(db, accountsRepository.createTwrLiquidityAccount(userId, {
    accountId: account.id,
    name: 'Liquidez',
  }))
  const instrument = await runWithDb(db, marketRepository.createInstrument({
    symbol,
    normalizedSymbol: symbol,
    provider: 'test',
    currency: 'EUR',
  }))
  await runWithDb(db, marketRepository.createUserInstrument(userId, {
    instrumentId: instrument.id,
    categoryId: category.id,
    alias: account.id,
    quoteConfig: {
      symbol,
      quoteSymbol: `${symbol}.DE`,
      type: 'etf',
      provider: 'test',
      currency: 'EUR',
      market: 'XETRA',
      active: true,
      holdingUnits: 2.5,
      holdingsSource: 'manual',
      holdingsAsOf: '2026-04-01',
      holdingsUpdatedAt: '2026-04-01T10:00:00Z',
    },
  }))
  await runWithDb(db, transactionsRepository.create(userId, {
    legacyId: 'tx-1',
    accountId: account.id,
    categoryId: category.id,
    type: 'investment',
    date: '2026-03-02',
    description: 'Compra',
    amount: -250.5,
    currency: 'EUR',
    time: '09:30',
    declared: true,
    accountingMonth: 4,
    operation: {
      instrumentId: instrument.id,
      symbol,
      side: 'buy',
      units: 2.5,
      unitPrice: 100,
      fee: 0.5,
    },
    externalId: 'bitvavo-1',
    remoteOperation: {
      provider: 'bitvavo',
      externalId: 'bitvavo-1',
      executedAt: '2026-03-02T08:30:00Z',
      timeZone: 'Europe/Madrid',
      date: '2026-03-02',
      time: '09:30',
      side: 'buy',
      symbol,
      quantity: '2.5',
      unitPrice: '100',
    } as never,
  }))
  await runWithDb(db, subscriptionsRepository.create(userId, {
    name: 'Cine',
    accountId: account.id,
    categoryId: category.id,
    amount: 9.99,
    currency: 'EUR',
    startDate: '2026-01-01',
    nextChargeDate: '2026-04-01',
    frequency: 'monthly',
    isActive: false,
  }))
  const rule = await runWithDb(db, recurringRulesRepository.create(userId, {
    name: 'Aporte mensual',
    type: 'investment',
    accountId: account.id,
    categoryId: category.id,
    amount: 200,
    currency: 'EUR',
    frequency: 'monthly',
    interval: 2,
    startDate: '2026-01-05',
    endDate: '2027-01-05',
    lastExecutionDate: '2026-03-05',
    nextRunDate: '2026-05-05',
    symbol,
    side: 'buy',
    units: 2,
    unitPrice: 100,
    fee: 1,
    time: '10:00',
    status: 'paused',
  }))
  await runWithDb(db, pendingMovementsRepository.create(userId, {
    recurringRuleId: rule.id,
    accountId: account.id,
    categoryId: category.id,
    amount: 200,
    currency: 'EUR',
    dueDate: '2026-05-05',
    type: 'investment',
    description: 'Aporte',
    symbol,
    side: 'buy',
    units: 2,
    unitPrice: 100,
    fee: 1,
    time: '10:00',
    transactionId: 'tx-1',
    status: 'confirmed',
  }))
  await runWithDb(db, budgetEntriesRepository.create(userId, {
    categoryId: category.id,
    year: 2026,
    month: 4,
    amount: 50,
    currency: 'EUR',
  }))
  const savingCategory = await runWithDb(db, accountsRepository.createCategory(userId, {
    name: 'Fondo de emergencia',
    kind: 'saving',
  }))
  const origin = await runWithDb(db, accountsRepository.create(userId, {
    name: 'Corriente',
    kind: 'cash',
    currency: 'EUR',
    openingBalance: 1000,
  }))
  const destination = await runWithDb(db, accountsRepository.create(userId, {
    name: 'Hucha',
    kind: 'cash',
    currency: 'EUR',
    openingBalance: 0,
  }))
  await runWithDb(db, transactionsRepository.create(userId, {
    legacyId: 'tx-saving',
    accountId: origin.id,
    destinationAccountId: destination.id,
    categoryId: savingCategory.id,
    type: 'saving',
    date: '2026-03-03',
    description: 'Ahorro',
    amount: 150,
    currency: 'EUR',
  }))
  // A prior-year movement: the export is never year-filtered, so it must
  // survive export → import → export along with this year's rows.
  await runWithDb(db, transactionsRepository.create(userId, {
    legacyId: 'tx-2025',
    accountId: account.id,
    categoryId: category.id,
    type: 'expense',
    date: '2025-12-31',
    amount: -7.5,
    currency: 'EUR',
  }))
  const savingRule = await runWithDb(db, recurringRulesRepository.create(userId, {
    name: 'Ahorro mensual',
    type: 'saving',
    accountId: origin.id,
    destinationAccountId: destination.id,
    categoryId: savingCategory.id,
    amount: 100,
    currency: 'EUR',
    frequency: 'monthly',
  }))
  await runWithDb(db, pendingMovementsRepository.create(userId, {
    recurringRuleId: savingRule.id,
    accountId: origin.id,
    destinationAccountId: destination.id,
    categoryId: savingCategory.id,
    amount: 100,
    currency: 'EUR',
    dueDate: '2026-05-05',
    type: 'saving',
    description: 'Ahorro',
  }))
  await runWithDb(db, goalsRepository.create(userId, {
    key: 'saving:emergencia',
    categoryId: savingCategory.id,
    name: 'Colchón',
    targetAmount: 3000,
    currency: 'EUR',
  }))
  await runWithDb(db, goalsRepository.create(userId, {
    key: 'fire',
    name: 'Independencia',
    targetYear: 2040,
    targetAmount: 500000,
    currency: 'EUR',
  }))
  const snapshot = await runWithDb(db, wealthRepository.create(userId, {
    snapshotDate: '2026-03-31',
    year: 2026,
    month: 3,
  }))
  await runWithDb(db, wealthRepository.createBalance(userId, {
    snapshotId: snapshot.id,
    accountId: account.id,
    balance: 1234.56,
    currency: 'EUR',
  }))
  const contribution = await runWithDb(db, contributionsRepository.create(userId, {
    date: '2026-03-10',
    amount: 300,
    currency: 'EUR',
    portfolioDate: '2026-03-09',
    portfolioValue: 10000,
    flow: 300,
  }))
  await runWithDb(db, contributionsRepository.createAllocation(userId, {
    contributionId: contribution.id,
    accountId: account.id,
    amount: 300,
    currency: 'EUR',
  }))
  await runWithDb(db, stockeventsSymbolMappingsRepository.create(userId, {
    categoryId: category.id,
    stockeventsSymbol: `${symbol}.DE`,
    sync: true,
    watchlistId: 'wl-1',
    hidden: true,
  }))
  await runWithDb(db, stockeventsCashMappingsRepository.upsertMapping(userId, {
    accountId: account.id,
    watchlistId: 'wl-1',
  }))
  await runWithDb(db, stockeventsCashMappingsRepository.upsertSyncEntry(userId, {
    contributionDate: '2026-03-10',
    accountId: account.id,
    watchlistId: 'wl-1',
    syncedAmount: 300,
    currency: 'EUR',
  }))
  await runWithDb(db, userSettingsRepository.create(userId, {
    onboardingPresented: true,
    onboardingDismissed: true,
    onboardingAccountCompleted: true,
    onboardingMovementCompleted: true,
    onboardingCompleted: true,
    currency: 'EUR',
    locale: 'es-ES',
    theme: 'dark',
    stockeventsEnabled: true,
    stockeventsTradesToCash: false,
  }))
}

function postJson(url: string, body: unknown): Request {
  return new Request(url, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(body),
  })
}

describe('GET /api/data/export + POST /api/data/import', () => {
  let testDb: TestDatabase
  let principal: AuthPrincipal
  const recorder = createStatementRecorder()

  beforeEach(async () => {
    testDb = createTestDb({ onStatement: recorder.onStatement })
    currentDb = testDb.db
    const user = await seedUser(testDb.db, 'export-user@example.com')
    principal = {
      userId: user.id,
      email: user.email,
      provider: 'better-auth',
      subject: 'sub-1',
    }
  })

  afterEach(() => {
    vi.restoreAllMocks()
    testDb.close()
  })

  it('returns 401 without a principal', async () => {
    const { GET } = await import('../../../../src/pages/api/data/export')
    const response = await GET({ locals: {} } as never)
    expect(response.status).toBe(401)
  })

  it('never includes integration_credentials, even when the user has one configured', async () => {
    const testEnv = { DATA_ENCRYPTION_KEY: Buffer.alloc(32, 7).toString('base64') }
    await runWithDb(testDb.db, integrationCredentialsRepository.create(principal.userId,
      { provider: 'stockevents', secret: 'super-secret-plaintext-key' },
      testEnv,))

    const { GET } = await import('../../../../src/pages/api/data/export')
    const response = await GET({ locals: { principal } } as never)
    const bodyText = await response.text()
    expect(bodyText).not.toContain('super-secret-plaintext-key')
    expect(bodyText).not.toContain('integrationCredentials')
    expect(bodyText).not.toContain('integration_credentials')
  })

  it('loads every relation collection in batches, never once per parent row', async () => {
    const account = await runWithDb(testDb.db, accountsRepository.create(principal.userId, {
      name: 'Broker',
      kind: 'investment',
      currency: 'EUR',
      openingBalance: 0,
    }))
    const snapshotIds: string[] = []
    const contributionIds: string[] = []
    const transactionIds: string[] = []
    for (let index = 0; index < 3; index += 1) {
      const snapshot = await runWithDb(testDb.db, wealthRepository.create(principal.userId, {
        snapshotDate: `2026-0${index + 1}-28`,
        year: 2026,
        month: index + 1,
      }))
      snapshotIds.push(snapshot.id)
      await runWithDb(testDb.db, wealthRepository.createBalance(principal.userId, {
        snapshotId: snapshot.id,
        accountId: account.id,
        balance: 100 + index,
        currency: 'EUR',
      }))

      const contribution = await runWithDb(testDb.db, contributionsRepository.create(principal.userId, {
        date: `2026-0${index + 1}-10`,
        amount: 50 + index,
        currency: 'EUR',
      }))
      contributionIds.push(contribution.id)
      await runWithDb(testDb.db, contributionsRepository.createAllocation(principal.userId, {
        contributionId: contribution.id,
        accountId: account.id,
        amount: 50 + index,
        currency: 'EUR',
      }))

      const transaction = await runWithDb(testDb.db, transactionsRepository.create(principal.userId, {
        accountId: account.id,
        type: 'investment',
        date: `2026-0${index + 1}-02`,
        amount: -100 - index,
        currency: 'EUR',
        operation: {
          symbol: 'VWCE',
          side: 'buy',
          units: index + 1,
          unitPrice: 100,
          fee: 0.5,
        },
      }))
      transactionIds.push(transaction.id)
    }

    recorder.clear()

    const { GET } = await import('../../../../src/pages/api/data/export')
    const response = await GET({ locals: { principal } } as never)
    expect(response.status).toBe(200)
    const body = await response.json()

    expect(body.wealthSnapshots.flatMap((snapshot: Row) => snapshot.balances)).toHaveLength(3)
    expect(body.contributions.flatMap((contribution: Row) => contribution.allocations)).toHaveLength(3)
    expect(body.transactions.filter((transaction: Row) => transaction.operation !== null)).toHaveLength(3)

    // One query per relation, however many parent rows there are, observed at
    // the persistence boundary: a query per parent row would be three here.
    const balanceQueries = recorder.selectsFrom('snapshot_balances')
    expect(balanceQueries).toHaveLength(1)
    expect(balanceQueries[0].params).toEqual(expect.arrayContaining(snapshotIds))
    const allocationQueries = recorder.selectsFrom('contribution_allocations')
    expect(allocationQueries).toHaveLength(1)
    expect(allocationQueries[0].params).toEqual(expect.arrayContaining(contributionIds))
    const tradeDetailQueries = recorder.selectsFrom('investment_trade_details')
    expect(tradeDetailQueries).toHaveLength(1)
    expect(tradeDetailQueries[0].params).toEqual(expect.arrayContaining(transactionIds))
  })

  it("only exports the authenticated user's collections and relations", async () => {
    await seedFullDataset(testDb.db, principal.userId)
    const other = await seedUser(testDb.db, 'export-other@example.com')
    await seedFullDataset(testDb.db, other.id, 'VWCE-OTHER')

    const { GET } = await import('../../../../src/pages/api/data/export')
    const exported = await (await GET({ locals: { principal } } as never)).json()

    const otherSnapshots = await runWithDb(testDb.db, wealthRepository.listByUser(other.id))
    const otherContributions = await runWithDb(testDb.db, contributionsRepository.listByUser(other.id))
    const otherTransactions = await runWithDb(testDb.db, transactionsRepository.listByUser(other.id))
    // The other user really has data of their own for the export to leak.
    expect(otherSnapshots.length).toBeGreaterThan(0)
    expect(otherContributions.length).toBeGreaterThan(0)
    expect(otherTransactions.length).toBeGreaterThan(0)
    // ...and the export carries the authenticated user's own data.
    expect(exported.wealthSnapshots.length).toBeGreaterThan(0)
    expect(exported.contributions.length).toBeGreaterThan(0)
    expect(exported.transactions.length).toBeGreaterThan(0)
    const exportedIds = new Set(
      [
        ...exported.transactions,
        ...exported.wealthSnapshots,
        ...exported.contributions,
      ].map((row: Row) => row.id),
    )
    expect(otherSnapshots.some((row) => exportedIds.has(row.id))).toBe(false)
    expect(otherContributions.some((row) => exportedIds.has(row.id))).toBe(false)
    expect(otherTransactions.some((row) => exportedIds.has(row.id))).toBe(false)

    const ownAccountIds = new Set(exported.accounts.map((account: Row) => account.id))
    const exportedBalances = exported.wealthSnapshots.flatMap((snapshot: Row) => snapshot.balances)
    const exportedAllocations = exported.contributions.flatMap(
      (contribution: Row) => contribution.allocations,
    )
    expect(exportedBalances.length).toBeGreaterThan(0)
    expect(exportedAllocations.length).toBeGreaterThan(0)
    expect(exportedBalances.every((balance: Row) => ownAccountIds.has(balance.accountId))).toBe(true)
    expect(
      exportedAllocations.every((allocation: Row) => ownAccountIds.has(allocation.accountId)),
    ).toBe(true)
  })

  it('round-trips accounts/transactions through export → import with FK ids remapped', async () => {
    const account = await runWithDb(testDb.db, accountsRepository.create(principal.userId, {
      name: 'Cuenta origen',
      kind: 'cash',
      currency: 'EUR',
      openingBalance: 10,
    }))
    await runWithDb(testDb.db, transactionsRepository.create(principal.userId, {
      accountId: account.id,
      type: 'expense',
      date: '2024-01-01',
      amount: -5,
      currency: 'EUR',
    }))

    const { GET: exportGET } = await import('../../../../src/pages/api/data/export')
    const exportResponse = await exportGET({ locals: { principal } } as never)
    const exported = await exportResponse.json()
    expect(exported.accounts).toHaveLength(1)
    expect(exported.transactions).toHaveLength(1)

    // Import into a brand-new (empty) user — the account/transaction ids in
    // the export payload must not be reused verbatim; the importer remaps
    // old->new ids as it recreates the dependency chain.
    const otherUser = await seedUser(testDb.db, 'import-target@example.com')
    const otherPrincipal: AuthPrincipal = {
      userId: otherUser.id,
      email: otherUser.email,
      provider: 'better-auth',
      subject: 'sub-2',
    }

    const { POST: importPOST } = await import('../../../../src/pages/api/data/import')
    const importResponse = await importPOST({
      request: postJson('https://example.test/api/data/import', exported),
      locals: { principal: otherPrincipal },
    } as never)
    expect(importResponse.status).toBe(200)
    const importBody = await importResponse.json()
    expect(importBody.imported.accounts).toBe(1)
    expect(importBody.imported.transactions).toBe(1)
    expect(importBody.skipped.transactions ?? 0).toBe(0)

    const importedAccounts = await runWithDb(testDb.db, accountsRepository.listByUser(otherUser.id))
    expect(importedAccounts).toHaveLength(1)
    expect(importedAccounts[0].id).not.toBe(account.id)

    const importedTransactions = await runWithDb(testDb.db, transactionsRepository.listByUser(otherUser.id))
    expect(importedTransactions).toHaveLength(1)
    expect(importedTransactions[0].accountId).toBe(importedAccounts[0].id)
    expect(importedTransactions[0].amount).toBe(-5)
  })

  it.each(['append', 'replace'])(
    'advances the sync cursor and requests a full refresh after %s import',
    async (mode) => {
      await runWithDb(testDb.db, syncRepository.ensureRevision(principal.userId))
      for (let i = 0; i < 3; i++) await runWithDb(testDb.db, syncRepository.bumpRevision(principal.userId))
      const { POST } = await import('../../../../src/pages/api/data/import')
      const url = new URL(`https://example.test/api/data/import?mode=${mode}`)
      const response = await POST({
        request: postJson(url.href, {}),
        locals: { principal },
        url,
      } as never)
      expect(response.status).toBe(200)
      expect(await runWithDb(testDb.db, syncRepository.getRevision(principal.userId))).toMatchObject({
        revision: 4,
      })
      expect(await runWithDb(testDb.db, syncRepository.listChangesSince(principal.userId, 3))).toMatchObject([
        { revision: 4, entityType: 'reset' },
      ])
    },
  )

  it.each(['append', 'replace'])(
    'preserves receiving user onboarding during %s import',
    async (mode) => {
      await runWithDb(testDb.db, userSettingsRepository.create(principal.userId, {
        onboardingPresented: true,
        onboardingDismissed: false,
        onboardingAccountCompleted: true,
        onboardingMovementCompleted: true,
        onboardingCompleted: true,
      }))
      const { POST } = await import('../../../../src/pages/api/data/import')
      const url = new URL(`https://example.test/api/data/import?mode=${mode}`)
      const response = await POST({
        request: postJson(url.href, {
          settings: {
            currency: 'USD',
            onboardingPresented: 0,
            onboardingDismissed: 1,
            onboardingAccountCompleted: 0,
            onboardingMovementCompleted: 0,
            onboardingCompleted: 0,
          },
        }),
        locals: { principal },
        url,
      } as never)
      expect(response.status).toBe(200)
      expect(await runWithDb(testDb.db, userSettingsRepository.get(principal.userId))).toMatchObject({
        currency: 'USD',
        onboardingPresented: 1,
        onboardingDismissed: 0,
        onboardingAccountCompleted: 1,
        onboardingMovementCompleted: 1,
        onboardingCompleted: 1,
      })
    },
  )

  it('preserves completed onboarding when replacement has no settings', async () => {
    await runWithDb(testDb.db, userSettingsRepository.create(principal.userId, { onboardingCompleted: true }))
    const { POST } = await import('../../../../src/pages/api/data/import')
    const url = new URL('https://example.test/api/data/import?mode=replace')
    const response = await POST({
      request: postJson(url.href, {}),
      locals: { principal },
      url,
    } as never)
    expect(response.status).toBe(200)
    expect(
      (await runWithDb(testDb.db, userSettingsRepository.get(principal.userId)))?.onboardingCompleted,
    ).toBe(1)
  })

  it('restores a full export with ?mode=replace: the target ends up with exactly the backup', async () => {
    await seedFullDataset(testDb.db, principal.userId)
    const { GET: exportGET } = await import('../../../../src/pages/api/data/export')
    const exported = await (await exportGET({ locals: { principal } } as never)).json()
    expect(exported.format).toBe('finance-tracker/v2-export')
    // The backup keeps its exact top-level key order and field names.
    expect(Object.keys(exported)).toEqual([
      'format',
      'exportedAt',
      'userId',
      'settings',
      'accounts',
      'categories',
      'twrLiquidityAccounts',
      'transactions',
      'subscriptions',
      'recurringRules',
      'pendingMovements',
      'budgetEntries',
      'goals',
      'wealthSnapshots',
      'contributions',
      'userInstruments',
      'stockeventsSymbolMappings',
      'stockeventsCashMappings',
      'stockeventsCashSyncEntries',
    ])
    // Both nested relations and the export's own `operation` projection are
    // present; the raw bootstrap `tradeDetail` must not leak into the backup.
    const investment = exported.transactions.find((transaction: Row) => transaction.legacyId === 'tx-1')
    expect(investment.operation).toEqual({
      instrumentId: expect.any(String),
      symbol: 'VWCE',
      side: 'buy',
      units: 2.5,
      unitPrice: 100,
      fee: 0.5,
    })
    expect(exported.transactions.length).toBeGreaterThan(1)
    expect(
      exported.transactions.every((transaction: Row) => !('tradeDetail' in transaction)),
    ).toBe(true)
    expect(exported.wealthSnapshots[0].balances).toHaveLength(1)
    expect(exported.wealthSnapshots[0].balances[0]).toMatchObject({
      balance: 1234.56,
      currency: 'EUR',
    })
    expect(exported.contributions[0].allocations).toHaveLength(1)
    expect(exported.contributions[0].allocations[0]).toMatchObject({
      amount: 300,
      currency: 'EUR',
    })
    // The export has no year scope: the 2025 movement travels in the backup.
    expect(
      exported.transactions.some((transaction: Row) => transaction.legacyId === 'tx-2025'),
    ).toBe(true)

    // The target already has data of its own, which the restore must remove.
    const target = await seedUser(testDb.db, 'restore-target@example.com')
    const targetPrincipal: AuthPrincipal = { ...principal, userId: target.id, email: target.email }
    const stale = await runWithDb(testDb.db, accountsRepository.create(target.id, {
      name: 'Cuenta vieja',
      kind: 'cash',
      currency: 'EUR',
      openingBalance: 0,
    }))
    await runWithDb(testDb.db, transactionsRepository.create(target.id, {
      accountId: stale.id,
      type: 'expense',
      date: '2025-01-01',
      amount: -1,
      currency: 'EUR',
    }))

    const { POST: importPOST } = await import('../../../../src/pages/api/data/import')
    const importResponse = await importPOST({
      request: postJson('https://example.test/api/data/import?mode=replace', exported),
      locals: { principal: targetPrincipal },
      url: new URL('https://example.test/api/data/import?mode=replace'),
    } as never)
    expect(importResponse.status).toBe(200)
    const importBody = await importResponse.json()
    expect(importBody.skipped).toEqual({})

    const restored = await (
      await exportGET({ locals: { principal: targetPrincipal } } as never)
    ).json()
    expect(comparable(restored)).toEqual(comparable(exported))
  })

  it('without ?mode=replace the import adds to the existing rows', async () => {
    await runWithDb(testDb.db, accountsRepository.create(principal.userId, {
      name: 'Existente',
      kind: 'cash',
      currency: 'EUR',
      openingBalance: 0,
    }))
    const { POST: importPOST } = await import('../../../../src/pages/api/data/import')
    const response = await importPOST({
      request: postJson('https://example.test/api/data/import', {
        accounts: [{ id: 'old', name: 'Nueva', kind: 'cash', currency: 'EUR', openingBalance: 0 }],
      }),
      locals: { principal },
      url: new URL('https://example.test/api/data/import'),
    } as never)
    expect(response.status).toBe(200)
    expect(await runWithDb(testDb.db, accountsRepository.listByUser(principal.userId))).toHaveLength(2)
  })
})

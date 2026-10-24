import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import type { AuthPrincipal } from '../../../../src/lib/server/auth/principal'
import * as accountsRepository from '../../../../src/db/repositories/accounts'
import * as userSettingsRepository from '../../../../src/db/repositories/user-settings'
import { createTestDb, type TestDatabase } from '../setup'
import { seedUser } from '../repositories/fixtures'
import { runWithDb } from '../../../../src/db/database'

let currentDb: TestDatabase['db']
vi.mock('../../../../src/db/client', () => ({
  getDb: () => currentDb,
}))

function postJson(url: string, body?: unknown): Request {
  return new Request(url, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: body === undefined ? undefined : JSON.stringify(body),
  })
}

describe('POST /api/state/initialize', () => {
  let testDb: TestDatabase
  let principal: AuthPrincipal

  beforeEach(async () => {
    testDb = createTestDb()
    currentDb = testDb.db
    const user = await seedUser(testDb.db, 'init-user@example.com')
    principal = {
      userId: user.id,
      email: user.email,
      provider: 'better-auth',
      subject: 'sub-1',
    }
  })

  afterEach(() => {
    testDb.close()
  })

  it('returns 401 without a principal', async () => {
    const { POST } = await import('../../../../src/pages/api/state/initialize')
    const response = await POST({
      request: postJson('https://example.test/api/state/initialize'),
      locals: {},
    } as never)
    expect(response.status).toBe(401)
  })

  it('automatically provisions a new principal and initialize never duplicates categories', async () => {
    const { resolvePrincipal } = await import('../../../../src/lib/server/auth/principal')
    const input = { provider: 'cf-access', subject: 'new-user', email: 'new-user@example.com' }
    principal = await resolvePrincipal(testDb.db, input)
    const settings = await runWithDb(testDb.db, userSettingsRepository.get(principal.userId))
    expect(settings?.currency).toBe('EUR')
    const categories = await accountsRepository.listCategoriesByUser(testDb.db, principal.userId)
    expect(categories.map((row) => [row.name, row.kind, row.sortOrder])).toEqual([
      ['Nómina', 'income', 0],
      ['Otros ingresos', 'income', 1],
      ['Vivienda', 'expense', 0],
      ['Alimentación', 'expense', 1],
      ['Transporte', 'expense', 2],
      ['Suministros', 'expense', 3],
      ['Salud', 'expense', 4],
      ['Ocio', 'expense', 5],
      ['Otros gastos', 'expense', 6],
      ['Inversión', 'investment', 0],
    ])
    expect(await accountsRepository.listByUser(testDb.db, principal.userId)).toEqual([])
    expect(await resolvePrincipal(testDb.db, input)).toEqual(principal)
    const { POST } = await import('../../../../src/pages/api/state/initialize')
    const response = await POST({
      request: postJson('https://example.test/api/state/initialize'),
      locals: { principal },
    } as never)
    expect(response.status).toBe(200)
    expect((await response.json()).alreadyInitialized).toBe(true)
    expect(await accountsRepository.listCategoriesByUser(testDb.db, principal.userId)).toEqual(
      categories,
    )
    expect(await runWithDb(testDb.db, userSettingsRepository.get(principal.userId))).toEqual(settings)
  })

  it('does not add suggestions or change preferences for an existing user', async () => {
    const settings = await runWithDb(testDb.db, userSettingsRepository.create(principal.userId, {
      currency: 'USD',
      onboardingCompleted: true,
    }))
    const category = await accountsRepository.createCategory(testDb.db, principal.userId, {
      name: 'Personal',
      kind: 'expense',
      sortOrder: 0,
    })
    const { POST } = await import('../../../../src/pages/api/state/initialize')
    await POST({
      request: postJson('https://example.test/api/state/initialize'),
      locals: { principal },
    } as never)
    expect(await accountsRepository.listCategoriesByUser(testDb.db, principal.userId)).toEqual([
      category,
    ])
    expect(await runWithDb(testDb.db, userSettingsRepository.get(principal.userId))).toEqual(settings)
  })

  it('does not add suggestions to an existing empty user with absent settings', async () => {
    const { POST } = await import('../../../../src/pages/api/state/initialize')
    const response = await POST({
      request: postJson('https://example.test/api/state/initialize'),
      locals: { principal },
    } as never)
    expect(response.status).toBe(201)
    expect(await accountsRepository.listCategoriesByUser(testDb.db, principal.userId)).toEqual([])
  })

  it('preserves pre-existing categories even when settings have not been created', async () => {
    const category = await accountsRepository.createCategory(testDb.db, principal.userId, {
      name: 'Personal',
      kind: 'expense',
      sortOrder: 0,
    })
    const { POST } = await import('../../../../src/pages/api/state/initialize')
    await POST({
      request: postJson('https://example.test/api/state/initialize'),
      locals: { principal },
    } as never)
    expect(await accountsRepository.listCategoriesByUser(testDb.db, principal.userId)).toEqual([
      category,
    ])
  })
})

describe('POST /api/state/reset', () => {
  let testDb: TestDatabase
  let principal: AuthPrincipal

  beforeEach(async () => {
    testDb = createTestDb()
    currentDb = testDb.db
    const user = await seedUser(testDb.db, 'reset-user@example.com')
    principal = {
      userId: user.id,
      email: user.email,
      provider: 'better-auth',
      subject: 'sub-1',
    }
  })

  afterEach(() => {
    testDb.close()
  })

  it('returns 401 without a principal', async () => {
    const { POST } = await import('../../../../src/pages/api/state/reset')
    const response = await POST({
      request: postJson('https://example.test/api/state/reset'),
      locals: {},
    } as never)
    expect(response.status).toBe(401)
  })

  it("wipes the user's private data and re-seeds defaults", async () => {
    const syncRepository = await import('../../../../src/db/repositories/sync')
    await runWithDb(testDb.db, syncRepository.ensureRevision(principal.userId))
    await runWithDb(testDb.db, syncRepository.bumpRevision(principal.userId))
    await accountsRepository.create(testDb.db, principal.userId, {
      name: 'Cuenta a borrar',
      kind: 'cash',
      currency: 'EUR',
      openingBalance: 42,
    })
    await runWithDb(testDb.db, userSettingsRepository.create(principal.userId, {
      currency: 'USD',
      onboardingCompleted: true,
      onboardingPresented: true,
    }))

    const { POST } = await import('../../../../src/pages/api/state/reset')
    const response = await POST({
      request: postJson('https://example.test/api/state/reset'),
      locals: { principal },
    } as never)
    expect(response.status).toBe(200)
    const body = await response.json()
    expect(body.settings.currency).toBe('EUR')
    expect(body.settings.onboardingCompleted).toBe(1)
    expect(body.settings.onboardingPresented).toBe(1)
    expect(await runWithDb(testDb.db, syncRepository.getRevision(principal.userId))).toMatchObject({
      revision: 2,
    })
    expect(await runWithDb(testDb.db, syncRepository.listChangesSince(principal.userId, 1))).toMatchObject([
      { revision: 2, entityType: 'reset' },
    ])

    const accounts = await accountsRepository.listByUser(testDb.db, principal.userId)
    expect(accounts).toEqual([])
  })

  it('wipes owned children too, without leaving orphans or failing mid-way (§2.6)', async () => {
    const transactionsRepository = await import('../../../../src/db/repositories/transactions')
    const recurringRulesRepository = await import('../../../../src/db/repositories/recurring-rules')
    const pendingMovementsRepository =
      await import('../../../../src/db/repositories/pending-movements')
    const wealthRepository = await import('../../../../src/db/repositories/wealth')
    const contributionsRepository = await import('../../../../src/db/repositories/contributions')

    const account = await accountsRepository.create(testDb.db, principal.userId, {
      name: 'Cuenta a borrar',
      kind: 'cash',
      currency: 'EUR',
      openingBalance: 42,
    })

    // A part of a transaction: its investment operation.
    const investmentTx = await transactionsRepository.create(testDb.db, principal.userId, {
      accountId: account.id,
      type: 'investment',
      date: '2026-09-01',
      amount: 100,
      currency: 'EUR',
    })
    await transactionsRepository.createTradeDetail(testDb.db, principal.userId, {
      transactionId: investmentTx.id,
      side: 'buy',
      quantity: '1',
      price: 100,
      fee: 1,
      currency: 'EUR',
    })

    // A part of a recurring rule: its generated (not-yet-confirmed) occurrence.
    const rule = await runWithDb(testDb.db, recurringRulesRepository.create(principal.userId, {
      name: 'Aportación',
      type: 'investment',
      accountId: account.id,
      amount: 200,
      currency: 'EUR',
      frequency: 'monthly',
    }))
    await runWithDb(testDb.db, pendingMovementsRepository.create(principal.userId, {
      recurringRuleId: rule.id,
      accountId: account.id,
      amount: 200,
      currency: 'EUR',
      dueDate: '2026-10-01',
    }))

    // A part of a wealth snapshot: its per-account balance.
    const snapshot = await wealthRepository.create(testDb.db, principal.userId, {
      snapshotDate: '2026-09-30',
      year: 2026,
      month: 9,
    })
    await wealthRepository.createBalance(testDb.db, principal.userId, {
      snapshotId: snapshot.id,
      accountId: account.id,
      balance: 42,
      currency: 'EUR',
    })

    // A part of a contribution: its per-account allocation.
    const contribution = await contributionsRepository.create(testDb.db, principal.userId, {
      date: '2026-09-01',
      amount: 200,
      currency: 'EUR',
    })
    await contributionsRepository.createAllocation(testDb.db, principal.userId, {
      contributionId: contribution.id,
      accountId: account.id,
      amount: 200,
      currency: 'EUR',
    })

    const { POST } = await import('../../../../src/pages/api/state/reset')
    const response = await POST({
      request: postJson('https://example.test/api/state/reset'),
      locals: { principal },
    } as never)

    expect(response.status).toBe(200)
    expect(await accountsRepository.listByUser(testDb.db, principal.userId)).toEqual([])
    expect(await transactionsRepository.listByUser(testDb.db, principal.userId)).toEqual([])
    expect(await runWithDb(testDb.db, recurringRulesRepository.listByUser(principal.userId))).toEqual([])
    expect(await runWithDb(testDb.db, pendingMovementsRepository.listByUser(principal.userId))).toEqual([])
    expect(await wealthRepository.listByUser(testDb.db, principal.userId)).toEqual([])
    expect(await contributionsRepository.listByUser(testDb.db, principal.userId)).toEqual([])
    expect(
      await transactionsRepository.getTradeDetailByTransaction(
        testDb.db,
        principal.userId,
        investmentTx.id,
      ),
    ).toBeUndefined()
    expect(
      await wealthRepository.listBalancesBySnapshot(testDb.db, principal.userId, snapshot.id),
    ).toEqual([])
    expect(
      await contributionsRepository.listAllocationsByContribution(
        testDb.db,
        principal.userId,
        contribution.id,
      ),
    ).toEqual([])
  })
})

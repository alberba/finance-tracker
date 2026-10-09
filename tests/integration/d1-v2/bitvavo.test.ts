import { afterEach, beforeEach, expect, it } from 'vitest'
import { createTestDb, type TestDatabase } from './setup'
import * as users from '../../../src/db/repositories/users'
import * as accounts from '../../../src/db/repositories/accounts'
import * as transactions from '../../../src/db/repositories/transactions'
import {
  configureBitvavo,
  previewBitvavo,
  confirmBitvavo,
} from '../../../src/lib/server/bitvavo/import'
import { buildBootstrapPayload } from '../../../src/lib/server/bootstrap-payload'
import fixture from '../../unit/fixtures/bitvavo-real-sanitized.json'
import * as bitvavo from '../../../src/db/repositories/bitvavo'
import * as sync from '../../../src/db/repositories/sync'
import * as market from '../../../src/db/repositories/market'
import { applySyncBatch } from '../../../src/lib/server/sync/apply-command'
import { projectSyncV2State } from '../../../src/lib/client/v2-state-projection'

let testDb: TestDatabase
const env = { DATA_ENCRYPTION_KEY: btoa('a'.repeat(32)) }
const http: typeof fetch = async () =>
  Response.json({ items: fixture.transactions, currentPage: 1, totalPages: 1 })
beforeEach(() => {
  testDb = createTestDb()
})
afterEach(() => testDb.close())

async function importedUser() {
  const { user, account } = await configuredUser()
  const preview = await previewBitvavo(testDb.db, user.id, env, http)
  await confirmBitvavo(testDb.db, user.id, preview.id, [])
  return { user, account, preview, bootstrap: await buildBootstrapPayload(testDb.db, user.id) }
}

it('imports a closed preview idempotently', async () => {
  const { user, preview } = await importedUser()
  await confirmBitvavo(testDb.db, user.id, preview.id, [])
  expect((await buildBootstrapPayload(testDb.db, user.id)).transactions).toHaveLength(2)
})

it('retains exact remote operations through bootstrap and projection', async () => {
  const { bootstrap } = await importedUser()
  expect(bootstrap.transactions[0]).toMatchObject({
    declared: false,
    remoteOperation: { provider: 'bitvavo', unitPrice: '76953', fee: '0.01789334395' },
  })
  expect(bootstrap.transactions[1].amount).toBe(-58.33)
  expect(projectSyncV2State(bootstrap).transactions[0].remoteOperation?.fee).toBe('0.01789334395')
})

it('does not expose credentials in the synchronized bootstrap', async () => {
  const { bootstrap } = await importedUser()
  expect(JSON.stringify(bootstrap)).not.toContain('secret')
})

it('isolates an import preview from another user', async () => {
  const { preview } = await importedUser()
  const stranger = await users.create(testDb.db, { email: 'stranger@example.com' })
  await expect(confirmBitvavo(testDb.db, stranger.id, preview.id, [])).rejects.toThrow()
  expect((await buildBootstrapPayload(testDb.db, stranger.id)).transactions).toEqual([])
})

it('rejects deletion of a remote financial operation', async () => {
  const { user, bootstrap } = await importedUser()
  await expect(
    transactions.remove(testDb.db, user.id, bootstrap.transactions[0].id),
  ).rejects.toThrow('Bitvavo')
})

async function configuredUser() {
  const user = await users.create(testDb.db, { email: 'owner@example.com' })
  const account = await accounts.create(testDb.db, user.id, {
    name: 'Bitvavo',
    kind: 'cash',
    currency: 'EUR',
    openingBalance: 0,
  })
  await configureBitvavo(
    testDb.db,
    user.id,
    env,
    {
      apiKey: 'key',
      apiSecret: 'secret',
      accountId: account.id,
      startDate: '2019-01-01',
      timeZone: 'Europe/Madrid',
    },
    http,
  )
  return { user, account }
}

it('requires explicit duplicate resolution and links the chosen manual movement', async () => {
  const { user, account } = await configuredUser()
  const manual = await transactions.create(testDb.db, user.id, {
    accountId: account.id,
    type: 'investment',
    date: '2020-01-01',
    amount: 6.85,
    currency: 'EUR',
    declared: true,
    operation: { symbol: 'BTC', side: 'buy', units: 0.00008878285, unitPrice: 76953, fee: 0.02 },
  })
  const preview = await previewBitvavo(testDb.db, user.id, env, http)
  expect(preview.operations[0].candidates.map((candidate) => candidate.id)).toEqual([manual.id])
  await expect(confirmBitvavo(testDb.db, user.id, preview.id, [])).rejects.toThrow('duplicados')
  expect(await transactions.listByUser(testDb.db, user.id)).toHaveLength(1)
  await confirmBitvavo(testDb.db, user.id, preview.id, [
    { externalId: 'example-1', transactionId: manual.id },
  ])
  const bootstrap = await buildBootstrapPayload(testDb.db, user.id)
  expect(bootstrap.transactions).toHaveLength(2)
  expect(bootstrap.transactions.find((row) => row.id === manual.id)).toMatchObject({
    declared: true,
    remoteOperation: { externalId: 'example-1' },
  })
})

it('resumes a partial failure without advancing the cursor or duplicating completed movements', async () => {
  const { user } = await configuredUser()
  const preview = await previewBitvavo(testDb.db, user.id, env, http)
  testDb.sqlite.exec(
    "CREATE TRIGGER fail_sale BEFORE INSERT ON investment_trade_details WHEN NEW.side = 'sell' BEGIN SELECT RAISE(ABORT, 'simulated failure'); END",
  )
  await expect(confirmBitvavo(testDb.db, user.id, preview.id, [])).rejects.toThrow('reintentar')
  expect((await bitvavo.getConnection(testDb.db, user.id))?.cursor).toBeNull()
  expect((await buildBootstrapPayload(testDb.db, user.id)).transactions).toHaveLength(1)
  testDb.sqlite.exec('DROP TRIGGER fail_sale')
  await confirmBitvavo(testDb.db, user.id, preview.id, [])
  expect((await buildBootstrapPayload(testDb.db, user.id)).transactions).toHaveLength(2)
  expect((await bitvavo.getConnection(testDb.db, user.id))?.cursor).toBe(preview.to)
  const changes = await sync.listChangesSince(testDb.db, user.id, 0)
  expect(changes).toHaveLength(2)
  expect(JSON.parse(changes[1].payload!).remoteOperation.fee).toBe('0.14748650471')
})

it('automatically links a unique symbol belonging to the user', async () => {
  const { user } = await configuredUser()
  const instrument = await market.createInstrument(testDb.db, {
    symbol: 'BTC',
    normalizedSymbol: 'BTC',
    provider: 'coingecko',
    currency: 'EUR',
  })
  await market.createUserInstrument(testDb.db, user.id, { instrumentId: instrument.id })
  const preview = await previewBitvavo(testDb.db, user.id, env, http)
  await confirmBitvavo(testDb.db, user.id, preview.id, [])
  expect(
    (await buildBootstrapPayload(testDb.db, user.id)).transactions[0].tradeDetail?.instrumentId,
  ).toBe(instrument.id)
})

it('synchronizes declaration changes without losing the remote operation', async () => {
  const { user, bootstrap } = await importedUser()
  const purchase = bootstrap.transactions[0]
  const updated = await applySyncBatch(testDb.db, user.id, [
    {
      commandId: 'declare',
      action: 'update',
      entityType: 'transaction',
      entityId: purchase.id,
      baseVersion: purchase.version,
      patch: { declared: true },
    },
  ])
  expect(updated.results[0]).toMatchObject({
    status: 'applied',
    entity: { declared: true, tradeDetail: { quantity: '0.00008878285' } },
  })
})

it('rejects synchronized changes to remote financial fields', async () => {
  const { user, bootstrap } = await importedUser()
  const purchase = bootstrap.transactions[0]
  const rejected = await applySyncBatch(testDb.db, user.id, [
    {
      commandId: 'change-financial',
      action: 'update',
      entityType: 'transaction',
      entityId: purchase.id,
      baseVersion: purchase.version,
      patch: { amount: 100 },
    },
  ])
  expect(rejected.results[0].status).toBe('rejected')
})

it('offers historical sales calculated with gross plus fee as explicit duplicate candidates', async () => {
  const { user, account } = await configuredUser()
  const manual = await transactions.create(testDb.db, user.id, {
    accountId: account.id,
    type: 'investment',
    date: '2020-01-01',
    amount: -58.63,
    currency: 'EUR',
    operation: {
      symbol: 'BTC',
      side: 'sell',
      units: 0.0005,
      unitPrice: 116958.69300942,
      fee: 0.15,
    },
  })
  const preview = await previewBitvavo(testDb.db, user.id, env, http)
  expect(preview.operations.find((op) => op.side === 'sell')?.candidates.map((c) => c.id)).toEqual([
    manual.id,
  ])
})

it('preserves a local description when linking an explicit manual duplicate', async () => {
  const { user, account } = await configuredUser()
  const manual = await transactions.create(testDb.db, user.id, {
    accountId: account.id,
    type: 'investment',
    date: '2020-01-01',
    amount: 6.85,
    currency: 'EUR',
    description: 'My purchase notes',
    operation: { symbol: 'BTC', side: 'buy', units: 0.00008878285, unitPrice: 76953, fee: 0.02 },
  })
  const preview = await previewBitvavo(testDb.db, user.id, env, http)
  await confirmBitvavo(testDb.db, user.id, preview.id, [
    { externalId: 'example-1', transactionId: manual.id },
  ])
  expect((await transactions.get(testDb.db, user.id, manual.id))?.description).toBe(
    'My purchase notes',
  )
})

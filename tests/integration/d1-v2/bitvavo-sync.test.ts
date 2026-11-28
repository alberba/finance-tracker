import { afterEach, beforeEach, describe, expect, it } from 'vitest'
import { createTestDb, type TestDatabase } from './setup'
import * as users from '../../../src/db/repositories/users'
import * as accounts from '../../../src/db/repositories/accounts'
import * as transactions from '../../../src/db/repositories/transactions'
import * as market from '../../../src/db/repositories/market'
import * as credentials from '../../../src/db/repositories/integration-credentials'
import * as bitvavo from '../../../src/db/repositories/bitvavo'
import {
  configureBitvavo,
  confirmBitvavo,
  disconnectBitvavo,
  previewBitvavo,
  syncBitvavo,
  SYNC_OVERLAP_MS,
} from '../../../src/lib/server/bitvavo/import'
import { buildBootstrapPayload } from '../../../src/lib/server/bootstrap-payload'
import { applySyncBatch } from '../../../src/lib/server/sync/apply-command'
import { runWithDb } from '../../../src/db/database'
import { runServer } from '../../../src/lib/server/runtime'
import fixture from '../../unit/fixtures/bitvavo-real-sanitized.json'

const env = { DATA_ENCRYPTION_KEY: btoa('a'.repeat(32)) }
const [purchase, sale] = fixture.transactions
let testDb: TestDatabase
let remote: unknown[]
let requests: URL[]
let status: number
const http: typeof fetch = async (input) => {
  requests.push(new URL(String(input)))
  if (status !== 200) return new Response('provider body with test-secret', { status })
  return Response.json({ items: remote, currentPage: 1, totalPages: 1 })
}

beforeEach(() => {
  testDb = createTestDb()
  remote = [purchase, sale]
  requests = []
  status = 200
})
afterEach(() => testDb.close())

const run = <A, E>(effect: Parameters<typeof runServer<A, E>>[1]) =>
  runServer(testDb.db, effect, http)
const db = <A, E>(effect: Parameters<typeof runWithDb<A, E>>[1]) => runWithDb(testDb.db, effect)

async function createUser(email = 'owner@example.com') {
  const user = await db(users.create({ email }))
  const account = await db(
    accounts.create(user.id, { name: 'Bitvavo', kind: 'cash', currency: 'EUR', openingBalance: 0 }),
  )
  return { user, account }
}

async function configure(
  userId: string,
  accountId: string,
  patch: Partial<{ apiKey: string; apiSecret: string; startDate: string; timeZone: string }> = {},
) {
  await run(
    configureBitvavo(userId, env, {
      apiKey: 'key',
      apiSecret: 'secret',
      accountId,
      startDate: '2019-01-01',
      timeZone: 'Europe/Madrid',
      ...patch,
    }),
  )
}

/** A user whose first import already completed. */
async function importedUser(email?: string) {
  const { user, account } = await createUser(email)
  await configure(user.id, account.id)
  const preview = await run(previewBitvavo(user.id, env))
  await run(confirmBitvavo(user.id, preview.id, []))
  return { user, account }
}

const movements = async (userId: string) => (await db(buildBootstrapPayload(userId))).transactions
const connection = (userId: string) => db(bitvavo.getConnection(userId))
const nonEuro = {
  ...purchase,
  transactionId: 'example-usd',
  executedAt: '2020-01-02T10:00:00.000Z',
  priceCurrency: 'USD',
}

describe('incremental sync', () => {
  it('requires the first import before synchronizing', async () => {
    const { user, account } = await createUser()
    await configure(user.id, account.id)
    await expect(run(syncBitvavo(user.id, env))).rejects.toThrow('importación inicial')
  })

  it('records the first import as the last correct sync with its counters', async () => {
    const { user } = await importedUser()
    expect(await connection(user.id)).toMatchObject({
      lastAttemptStatus: 'success',
      lastCounts: { created: 2, updated: 0, unchanged: 0, skipped: 0 },
      cursor: Date.parse(sale.executedAt),
    })
    expect((await connection(user.id))?.lastSuccessAt).toEqual(expect.any(Number))
  })

  it('re-reads an overlap before the cursor and classifies by external identity', async () => {
    const { user } = await importedUser()
    const later = {
      ...purchase,
      transactionId: 'example-3',
      executedAt: '2020-01-03T09:00:00.000Z',
    }
    remote = [purchase, sale, later]
    const result = await run(syncBitvavo(user.id, env))
    expect(result).toEqual({
      status: 'success',
      counts: { created: 1, updated: 0, unchanged: 2, skipped: 0 },
    })
    expect(Number(requests.at(-1)?.searchParams.get('fromDate'))).toBe(
      Date.parse(sale.executedAt) - SYNC_OVERLAP_MS,
    )
    expect(await movements(user.id)).toHaveLength(3)
    expect((await connection(user.id))?.cursor).toBe(Date.parse(later.executedAt))

    const again = await run(syncBitvavo(user.id, env))
    expect(again.counts).toEqual({ created: 0, updated: 0, unchanged: 3, skipped: 0 })
    expect(await movements(user.id)).toHaveLength(3)
  })

  it('applies a remote correction and keeps declaration and the instrument link', async () => {
    const { user } = await importedUser()
    const instrument = await db(
      market.createInstrument({
        symbol: 'BTC',
        normalizedSymbol: 'BTC',
        provider: 'coingecko',
        currency: 'EUR',
      }),
    )
    await db(market.createUserInstrument(user.id, { instrumentId: instrument.id }))
    const [bought] = await movements(user.id)
    await db(bitvavo.linkInstrument(user.id, bought.id, instrument.id))
    const linked = (await movements(user.id))[0]
    await db(
      applySyncBatch(user.id, [
        {
          commandId: 'declare',
          action: 'update',
          entityType: 'transaction',
          entityId: linked.id,
          baseVersion: linked.version,
          patch: { declared: true, description: 'Mis notas' },
        },
      ]),
    )
    remote = [{ ...purchase, feesAmount: '0.02789334395' }, sale]
    const result = await run(syncBitvavo(user.id, env))
    expect(result.counts).toMatchObject({ updated: 1, unchanged: 1 })
    expect((await movements(user.id))[0]).toMatchObject({
      declared: true,
      description: 'Mis notas',
      amount: 6.86,
      remoteOperation: { fee: '0.02789334395', cashAmount: '6.86' },
      tradeDetail: { instrumentId: instrument.id },
    })
  })

  it('does not advance the cursor when a sync fails between operations and resumes idempotently', async () => {
    const { user } = await importedUser()
    const cursor = (await connection(user.id))?.cursor
    remote = [
      purchase,
      sale,
      { ...purchase, transactionId: 'example-3', executedAt: '2020-01-03T09:00:00.000Z' },
      { ...sale, transactionId: 'example-4', executedAt: '2020-01-04T09:00:00.000Z' },
    ]
    testDb.sqlite.exec(
      "CREATE TRIGGER fail_sale BEFORE INSERT ON investment_trade_details WHEN NEW.side = 'sell' BEGIN SELECT RAISE(ABORT, 'simulated failure'); END",
    )
    await expect(run(syncBitvavo(user.id, env))).rejects.toThrow('Reintenta')
    expect(await connection(user.id)).toMatchObject({
      cursor,
      lastAttemptStatus: 'failed',
      lastError: 'La sincronización se interrumpió. Reintenta: no se duplicará nada.',
      lockToken: null,
    })
    expect(await movements(user.id)).toHaveLength(3)
    testDb.sqlite.exec('DROP TRIGGER fail_sale')
    const result = await run(syncBitvavo(user.id, env))
    expect(result.counts).toEqual({ created: 1, updated: 0, unchanged: 3, skipped: 0 })
    expect(await movements(user.id)).toHaveLength(4)
    expect((await connection(user.id))?.cursor).toBe(Date.parse('2020-01-04T09:00:00.000Z'))
  })

  it('rejects a concurrent sync of the same connection', async () => {
    const { user } = await importedUser()
    await db(bitvavo.acquire(user.id, 'another-run'))
    await expect(run(syncBitvavo(user.id, env))).rejects.toThrow('en curso')
    expect((await connection(user.id))?.lastAttemptStatus).toBe('success')
  })

  it('keeps the connection of another user untouched', async () => {
    const owner = await importedUser()
    const stranger = await createUser('stranger@example.com')
    await expect(run(syncBitvavo(stranger.user.id, env))).rejects.toThrow('Conecta Bitvavo')
    await expect(run(disconnectBitvavo(stranger.user.id))).resolves.toBeUndefined()
    expect(await connection(owner.user.id)).toBeDefined()
    expect(await movements(stranger.user.id)).toEqual([])
    expect(await db(bitvavo.listAudit(stranger.user.id))).not.toContainEqual(
      expect.objectContaining({ action: 'sync' }),
    )
  })
})

describe('skipped operations', () => {
  it('skips non-EUR operations with date, identity and reason without blocking the rest', async () => {
    const { user, account } = await createUser()
    remote = [purchase, sale, nonEuro]
    await configure(user.id, account.id)
    const preview = await run(previewBitvavo(user.id, env))
    await run(confirmBitvavo(user.id, preview.id, []))
    expect(await movements(user.id)).toHaveLength(2)
    expect(await db(bitvavo.listSkipped(user.id))).toEqual([
      {
        externalId: 'example-usd',
        executedAt: nonEuro.executedAt,
        reason: 'Precio y comisión deben estar en EUR.',
      },
    ])
    expect((await connection(user.id))?.lastAttemptStatus).toBe('warning')
    // Only the minimum is stored: no remote payload.
    const stored = testDb.sqlite.prepare('SELECT * FROM bitvavo_skipped').all()
    expect(JSON.stringify(stored)).not.toContain('priceAmount')
  })

  it('retries skipped operations by querying Bitvavo again', async () => {
    const { user, account } = await createUser()
    remote = [purchase, sale, nonEuro]
    await configure(user.id, account.id)
    const preview = await run(previewBitvavo(user.id, env))
    await run(confirmBitvavo(user.id, preview.id, []))
    // The cursor is already past the skipped one: a plain sync would not reach it.
    remote = [purchase, sale, { ...nonEuro, priceCurrency: 'EUR' }]
    requests = []
    const result = await run(syncBitvavo(user.id, env, { retrySkipped: true }))
    expect(requests).toHaveLength(1)
    expect(Number(requests[0].searchParams.get('fromDate'))).toBeLessThanOrEqual(
      Date.parse(nonEuro.executedAt),
    )
    expect(result).toEqual({
      status: 'success',
      counts: { created: 1, updated: 0, unchanged: 2, skipped: 0 },
    })
    expect(await db(bitvavo.listSkipped(user.id))).toEqual([])
    expect(await movements(user.id)).toHaveLength(3)
  })
})

describe('credentials and attention', () => {
  it('leaves the connection in «Requiere atención» when Bitvavo rejects the key', async () => {
    const { user } = await importedUser()
    status = 401
    await expect(run(syncBitvavo(user.id, env))).rejects.toThrow('lectura')
    const state = await connection(user.id)
    expect(state).toMatchObject({ needsAttention: true, lastAttemptStatus: 'attention' })
    expect(state?.lastError).not.toContain('test-secret')
  })

  it('replaces the credential without losing cursor or movements', async () => {
    const { user, account } = await importedUser()
    status = 401
    await expect(run(syncBitvavo(user.id, env))).rejects.toThrow()
    const cursor = (await connection(user.id))?.cursor
    status = 200
    await configure(user.id, account.id, { apiKey: 'new-key', apiSecret: 'new-secret' })
    expect(await connection(user.id)).toMatchObject({ needsAttention: false, cursor })
    expect(
      JSON.parse((await db(credentials.getByProvider(user.id, 'bitvavo', env)))!.secret),
    ).toEqual({ apiKey: 'new-key', apiSecret: 'new-secret' })
    expect(await movements(user.id)).toHaveLength(2)
    await expect(run(syncBitvavo(user.id, env))).resolves.toMatchObject({ status: 'success' })
  })

  it('updates the settings without asking for the key again', async () => {
    const { user, account } = await importedUser()
    await run(
      configureBitvavo(user.id, env, {
        accountId: account.id,
        startDate: '2019-01-01',
        timeZone: 'Europe/Madrid',
      }),
    )
    expect(
      JSON.parse((await db(credentials.getByProvider(user.id, 'bitvavo', env)))!.secret),
    ).toEqual({ apiKey: 'key', apiSecret: 'secret' })
  })
})

describe('settings after the first import', () => {
  it('imports more history when the start date moves earlier and deletes nothing when it moves later', async () => {
    const { user, account } = await createUser()
    const older = {
      ...purchase,
      transactionId: 'example-0',
      executedAt: '2019-06-01T10:00:00.000Z',
    }
    remote = [older, purchase, sale]
    await configure(user.id, account.id, { startDate: '2020-01-01' })
    const preview = await run(previewBitvavo(user.id, env))
    await run(confirmBitvavo(user.id, preview.id, []))
    expect(await movements(user.id)).toHaveLength(2)

    await configure(user.id, account.id, { startDate: '2019-01-01' })
    expect((await connection(user.id))?.cursor).toBeNull()
    await run(syncBitvavo(user.id, env))
    expect(await movements(user.id)).toHaveLength(3)

    await configure(user.id, account.id, { startDate: '2020-01-02' })
    expect(await movements(user.id)).toHaveLength(3)
  })

  it('keeps the linked account after the first import', async () => {
    const { user } = await importedUser()
    const other = await db(
      accounts.create(user.id, { name: 'Otra', kind: 'cash', currency: 'EUR', openingBalance: 0 }),
    )
    await expect(configure(user.id, other.id)).rejects.toThrow('cuenta vinculada')
  })

  it('rematerializes date and time from the original UTC instant when the zone changes', async () => {
    const { user, account } = await importedUser()
    // 2020-01-01T00:00Z: 01:00 on 1 January in Madrid, 19:00 on 31 December in New York.
    await configure(user.id, account.id, { timeZone: 'America/New_York' })
    const [bought] = await movements(user.id)
    expect(bought).toMatchObject({
      date: '2019-12-31',
      time: '19:00:00',
      remoteOperation: {
        executedAt: purchase.executedAt,
        timeZone: 'America/New_York',
        date: '2019-12-31',
        time: '19:00:00',
      },
    })
    await configure(user.id, account.id, { timeZone: 'Europe/Madrid' })
    expect((await movements(user.id))[0]).toMatchObject({ date: '2020-01-01', time: '01:00:00' })
    // A sync afterwards finds nothing to correct.
    expect((await run(syncBitvavo(user.id, env))).counts).toMatchObject({ updated: 0 })
  })
})

describe('disconnect', () => {
  it('removes configuration and credential, keeps movements and recognizes them on reconnect', async () => {
    const { user, account } = await importedUser()
    await run(disconnectBitvavo(user.id))
    expect(await connection(user.id)).toBeUndefined()
    expect(await db(credentials.getByProvider(user.id, 'bitvavo', env))).toBeUndefined()
    expect(await movements(user.id)).toHaveLength(2)
    await expect(
      db(transactions.remove(user.id, (await movements(user.id))[0].id)),
    ).rejects.toThrow('Bitvavo')

    await configure(user.id, account.id)
    const preview = await run(previewBitvavo(user.id, env))
    expect(preview.operations.every((op) => op.alreadyImported)).toBe(true)
    const result = await run(confirmBitvavo(user.id, preview.id, []))
    expect(result.counts).toMatchObject({ created: 0, unchanged: 2 })
    expect(await movements(user.id)).toHaveLength(2)
  })
})

describe('audit', () => {
  it('records configuration, credential reads, syncs and disconnection without secrets', async () => {
    const { user } = await importedUser()
    await run(syncBitvavo(user.id, env))
    status = 401
    await expect(run(syncBitvavo(user.id, env))).rejects.toThrow()
    await run(disconnectBitvavo(user.id))
    const events = await db(bitvavo.listAudit(user.id))
    expect(events.map((event) => `${event.action}:${event.outcome}`)).toEqual(
      expect.arrayContaining([
        'configure:success',
        'credential_read:success',
        'sync:success',
        'sync:attention',
        'disconnect:success',
      ]),
    )
    const serialized = JSON.stringify(events)
    for (const secret of ['secret', 'key"', 'priceAmount', 'example-1', '76953'])
      expect(serialized).not.toContain(secret)
  })
})

import { afterEach, beforeEach, describe, expect, it } from 'vitest'
import {
  applyInstrumentLinkRepairPlan,
  buildInstrumentLinkRepairPlan,
  formatInstrumentLinkRepairPlan,
} from '../../../../scripts/lib/instrument-link-repair'
import { createTestDb, type TestDatabase } from '../setup'
import { MOVES, USER, seedProductionShape } from './instrument-link-fixtures'

function unitsByInstrument(testDb: TestDatabase): Record<string, number> {
  const rows = testDb.sqlite
    .prepare(
      `SELECT instrument_id AS id, SUM(CAST(quantity AS REAL)) AS units FROM investment_trade_details WHERE user_id = ? AND instrument_id IS NOT NULL GROUP BY instrument_id`,
    )
    .all(USER) as { id: string; units: number }[]
  return Object.fromEntries(rows.map((row) => [row.id, row.units]))
}

function movementState(testDb: TestDatabase, transactionId: string) {
  return testDb.sqlite
    .prepare(
      `SELECT t.account_id AS accountId, d.instrument_id AS instrumentId, t.version AS version FROM transactions t JOIN investment_trade_details d ON d.transaction_id = t.id WHERE t.id = ?`,
    )
    .get(transactionId) as { accountId: string; instrumentId: string | null; version: number }
}

function snapshotOfTables(testDb: TestDatabase) {
  return ['transactions', 'investment_trade_details', 'sync_changes', 'user_revisions'].map(
    (table) => testDb.sqlite.prepare(`SELECT * FROM ${table} ORDER BY 1`).all(),
  )
}

describe('reparación de vínculos de instrumento', () => {
  let testDb: TestDatabase

  beforeEach(() => {
    testDb = createTestDb()
    seedProductionShape(testDb.sqlite)
  })

  afterEach(() => {
    testDb.close()
  })

  it('el plan en seco lista cada cambio con su antes y después y no escribe nada', async () => {
    const before = snapshotOfTables(testDb)

    const plan = await buildInstrumentLinkRepairPlan(testDb.db, USER, { accountMoves: MOVES })

    expect(snapshotOfTables(testDb)).toEqual(before)
    expect(plan.movements).toEqual([
      {
        transactionId: 'eth-january-9',
        date: '2026-01-09',
        description: 'Compra ETH',
        symbol: 'ETH',
        instrument: {
          from: { id: 'inst-btc', symbol: 'BTC' },
          to: { id: 'inst-eth', symbol: 'ETH' },
        },
        account: {
          from: { id: 'acc-checking', name: 'Cuenta corriente' },
          to: { id: 'acc-bitvavo', name: 'Bitvavo' },
        },
      },
      {
        transactionId: 'eth-january-23',
        date: '2026-01-23',
        description: 'Compra ETH',
        symbol: 'ETH',
        instrument: {
          from: { id: 'inst-btc', symbol: 'BTC' },
          to: { id: 'inst-eth', symbol: 'ETH' },
        },
        account: {
          from: { id: 'acc-checking', name: 'Cuenta corriente' },
          to: { id: 'acc-bitvavo', name: 'Bitvavo' },
        },
      },
      {
        transactionId: 'eth-february-6',
        date: '2026-02-06',
        description: 'Compra ETH',
        symbol: 'ETH',
        instrument: {
          from: { id: 'inst-btc', symbol: 'BTC' },
          to: { id: 'inst-eth', symbol: 'ETH' },
        },
      },
      {
        transactionId: 'btc-august',
        date: '2026-08-10',
        description: 'Compra BTC',
        symbol: 'BTC',
        instrument: { from: null, to: { id: 'inst-btc', symbol: 'BTC' } },
      },
      {
        transactionId: 'eth-august',
        date: '2026-08-15',
        description: 'Compra ETH',
        symbol: 'ETH',
        instrument: { from: null, to: { id: 'inst-eth', symbol: 'ETH' } },
        account: {
          from: { id: 'acc-checking', name: 'Cuenta corriente' },
          to: { id: 'acc-bitvavo', name: 'Bitvavo' },
        },
      },
    ])
    expect(plan.skipped).toEqual([
      { transactionId: 'mystery', date: '2026-09-02', symbol: 'XYZ', reason: 'sin-instrumento' },
    ])
    expect(formatInstrumentLinkRepairPlan(plan)).toContain('eth-january-9')
  })

  it('la ejecución aplica el plan, deja las unidades de BTC y ETH como la suma de sus compras y es idempotente', async () => {
    const plan = await buildInstrumentLinkRepairPlan(testDb.db, USER, { accountMoves: MOVES })

    const report = await applyInstrumentLinkRepairPlan(testDb.db, USER, plan)

    expect(report).toEqual({ instrumentsLinked: 5, accountsMoved: 3 })
    expect(unitsByInstrument(testDb)).toEqual({ 'inst-btc': 0.75, 'inst-eth': 15 })
    for (const id of ['eth-january-9', 'eth-january-23', 'eth-february-6']) {
      expect(movementState(testDb, id)).toMatchObject({ instrumentId: 'inst-eth' })
    }
    expect(
      ['eth-january-9', 'eth-january-23', 'eth-february-6', 'eth-august', 'eth-ok'].map(
        (id) => movementState(testDb, id).accountId,
      ),
    ).toEqual(Array(5).fill('acc-bitvavo'))

    const afterFirstRun = snapshotOfTables(testDb)
    const secondPlan = await buildInstrumentLinkRepairPlan(testDb.db, USER, { accountMoves: MOVES })
    expect(secondPlan.movements).toEqual([])
    expect(await applyInstrumentLinkRepairPlan(testDb.db, USER, secondPlan)).toEqual({
      instrumentsLinked: 0,
      accountsMoved: 0,
    })
    expect(snapshotOfTables(testDb)).toEqual(afterFirstRun)
  })

  it('publica cada movimiento reparado en el log de sync para que los demás dispositivos lo reciban', async () => {
    const plan = await buildInstrumentLinkRepairPlan(testDb.db, USER, { accountMoves: MOVES })
    await applyInstrumentLinkRepairPlan(testDb.db, USER, plan)

    const changes = testDb.sqlite
      .prepare(
        `SELECT entity_type AS entityType, entity_id AS entityId, change_type AS changeType, payload FROM sync_changes WHERE user_id = ? ORDER BY revision`,
      )
      .all(USER) as { entityType: string; entityId: string; changeType: string; payload: string }[]

    expect(changes.map((change) => change.entityId).sort()).toEqual(
      plan.movements.map((movement) => movement.transactionId).sort(),
    )
    const eth = changes.find((change) => change.entityId === 'eth-january-9')!
    expect(eth).toMatchObject({ entityType: 'transaction', changeType: 'upsert' })
    expect(JSON.parse(eth.payload)).toMatchObject({
      accountId: 'acc-bitvavo',
      version: 2,
      tradeDetail: { instrumentId: 'inst-eth', symbol: 'ETH' },
    })
    const revision = testDb.sqlite
      .prepare(`SELECT revision FROM user_revisions WHERE user_id = ?`)
      .get(USER) as { revision: number }
    expect(revision.revision).toBe(5)
  })

  it('rechaza un plan cuyo movimiento cambió desde que se calculó, sin escribir nada', async () => {
    const plan = await buildInstrumentLinkRepairPlan(testDb.db, USER, { accountMoves: MOVES })
    testDb.sqlite
      .prepare(
        `UPDATE investment_trade_details SET instrument_id = 'inst-eth' WHERE transaction_id = 'eth-january-9'`,
      )
      .run()
    const before = snapshotOfTables(testDb)

    await expect(applyInstrumentLinkRepairPlan(testDb.db, USER, plan)).rejects.toThrow(
      /eth-january-9/,
    )

    expect(snapshotOfTables(testDb)).toEqual(before)
  })

  it('falla en el plan si la cuenta destino no existe en vez de saltarse el traslado', async () => {
    await expect(
      buildInstrumentLinkRepairPlan(testDb.db, USER, {
        accountMoves: [{ symbol: 'ETH', accountName: 'Kraken' }],
      }),
    ).rejects.toThrow(/Kraken/)
  })
})

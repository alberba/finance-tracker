import { afterEach, beforeEach, describe, expect, it } from 'vitest'
import {
  applyAccountMergePlan,
  buildAccountMergePlan,
  formatAccountMergePlan,
} from '../../../../scripts/lib/account-instrument-merge'
import { buildBootstrapPayload } from '../../../../src/lib/server/bootstrap-payload'
import { projectSyncV2State } from '../../../../src/lib/client/v2-state-projection'
import { buildAccountPositions } from '../../../../src/domain/investment/positions'
import { getWealthByMonth } from '../../../../src/lib/finance-core'
import { runWithDb } from '../../../../src/db/database'
import { createTestDb, type TestDatabase } from '../setup'
import { ETF_MERGES, USER, seedEtfAccounts } from './etf-merge-fixtures'

const options = { merges: ETF_MERGES }

function tablesSnapshot(testDb: TestDatabase) {
  return [
    'accounts',
    'snapshot_balances',
    'wealth_snapshots',
    'contribution_allocations',
    'contributions',
    'user_instruments',
    'transactions',
    'investment_trade_details',
    'sync_changes',
    'user_revisions',
  ].map((table) => testDb.sqlite.prepare(`SELECT * FROM ${table} ORDER BY 1`).all())
}

async function loadState(testDb: TestDatabase) {
  const bootstrap = await runWithDb(testDb.db, buildBootstrapPayload(USER, 2026))
  return projectSyncV2State(bootstrap as never, 2026)
}

describe('fusión de las cuentas-ETF en instrumentos de Trade Republic', () => {
  let testDb: TestDatabase

  beforeEach(() => {
    testDb = createTestDb()
    seedEtfAccounts(testDb.sqlite)
  })

  afterEach(() => {
    testDb.close()
  })

  it('el plan en seco lista cuentas, cierres y movimientos afectados y no escribe nada', async () => {
    const before = tablesSnapshot(testDb)

    const plan = await buildAccountMergePlan(testDb.db, USER, options)

    expect(tablesSnapshot(testDb)).toEqual(before)
    expect(plan.blockers).toEqual([])
    expect(plan.alreadyMerged).toEqual([])
    expect(plan.brokers).toEqual([
      {
        name: 'Trade Republic',
        id: null,
        create: true,
        currency: 'EUR',
        openingBalanceMinor: { from: 0, to: 50000 },
      },
    ])
    expect(
      plan.accounts.map((account) => [account.name, account.instruments.map((i) => i.symbol)]),
    ).toEqual([
      ['ETF XDWH', ['XDWH']],
      ['ETF IQQI', ['IQQI']],
      ['ETF AGED', ['AGED']],
      ['ETF SXRS', ['SXRS']],
      ['ETF Plata', ['PLATA']],
    ])
    // Cierre a cierre, lo que valía cada cuenta (con su saldo arrastrado y sus movimientos).
    expect(plan.closes.map((close) => [close.date, close.brokerBalanceMinor])).toEqual([
      ['2026-01-28', { from: null, to: 220000 }],
      ['2026-02-28', { from: null, to: 251000 }],
      ['2026-03-28', { from: null, to: 315000 }],
    ])
    expect(plan.closes[1].merged).toEqual([
      { accountName: 'ETF XDWH', balanceMinor: 110000 },
      { accountName: 'ETF IQQI', balanceMinor: 31000 },
      { accountName: 'ETF AGED', balanceMinor: 20000 },
      { accountName: 'ETF SXRS', balanceMinor: 40000 },
      { accountName: 'ETF Plata', balanceMinor: 50000 },
    ])
    expect(plan.allocations).toEqual([
      {
        contributionId: 'contrib-1',
        date: '2026-01-20',
        brokerName: 'Trade Republic',
        merged: [
          { accountName: 'ETF XDWH', amountMinor: 100000 },
          { accountName: 'ETF IQQI', amountMinor: 30000 },
        ],
        brokerAmountMinor: { from: null, to: 130000 },
      },
    ])
    expect(plan.movements.map((movement) => movement.transactionId)).toEqual([
      'xdwh-1',
      'iqqi-1',
      'sxrs-1',
      'aged-1',
      'plata-1',
      'xdwh-2',
      'sxrs-2',
    ])
    expect(plan.movements.find((movement) => movement.transactionId === 'xdwh-2')).toMatchObject({
      accountName: 'ETF XDWH',
      brokerName: 'Trade Republic',
      instrument: { from: null, to: { id: 'inst-xdwh', symbol: 'XDWH' } },
    })
    expect(
      plan.movements.find((movement) => movement.transactionId === 'xdwh-1')?.instrument,
    ).toBeUndefined()
    expect(formatAccountMergePlan(plan)).toContain('ETF XDWH')
  })

  it('con Trade Republic ya creada la suma de sus saldos incluye los suyos', async () => {
    testDb.close()
    testDb = createTestDb()
    seedEtfAccounts(testDb.sqlite, { brokerExists: true })

    const plan = await buildAccountMergePlan(testDb.db, USER, options)

    expect(plan.brokers).toEqual([
      {
        name: 'Trade Republic',
        id: 'acc-trade-republic',
        create: false,
        currency: 'EUR',
        openingBalanceMinor: { from: 10000, to: 60000 },
      },
    ])
    expect(plan.closes.map((close) => close.brokerBalanceMinor)).toEqual([
      { from: null, to: 230000 },
      { from: null, to: 261000 },
      { from: 15000, to: 330000 },
    ])
    expect(plan.allocations[0].brokerAmountMinor).toEqual({ from: null, to: 130000 })
  })

  it('la ejecución es transaccional: Trade Republic muestra los 5 instrumentos y el patrimonio no cambia', async () => {
    const plan = await buildAccountMergePlan(testDb.db, USER, options)

    const report = await applyAccountMergePlan(testDb.db, USER, plan, options)

    expect(report).toMatchObject({ accountsArchived: 5, closesMerged: 3, movementsReassigned: 7 })
    const state = await loadState(testDb)
    const broker = state.investmentAssets.find((asset) => asset.name === 'Trade Republic')!
    const positions = buildAccountPositions(state, 3).filter(
      (position) => position.accountId === broker.id,
    )
    expect(positions.map((position) => position.symbol).sort()).toEqual([
      'AGED',
      'IQQI',
      'PLATA',
      'SXRS',
      'XDWH',
    ])
    expect(positions.find((position) => position.symbol === 'XDWH')?.units).toBe(15)
    // Las cuentas originales siguen ahí, archivadas, y no valen nada.
    const archived = testDb.sqlite
      .prepare(
        `SELECT name, is_archived AS archived, opening_balance_minor AS opening FROM accounts WHERE name LIKE 'ETF %' ORDER BY name`,
      )
      .all()
    expect(archived).toHaveLength(5)
    expect(archived.every((row) => (row as { archived: number }).archived === 1)).toBe(true)
    expect(archived.every((row) => (row as { opening: number }).opening === 0)).toBe(true)
  })

  it('el patrimonio de cada cierre y el capital aportado salen idénticos a los calculados a mano', async () => {
    const plan = await buildAccountMergePlan(testDb.db, USER, options)
    await applyAccountMergePlan(testDb.db, USER, plan, options)

    const state = await loadState(testDb)
    const net = (month: number) =>
      getWealthByMonth(
        month as never,
        state.accounts,
        state.investmentAssets,
        state.liabilities,
        state.transactions,
        state.snapshots,
        state.instruments,
      ).net
    // Corriente + Acciones + las cinco cuentas-ETF (saldo arrastrado y movimientos incluidos).
    expect(net(1)).toBe(4900)
    expect(net(2)).toBe(5330)
    expect(net(3)).toBe(6080)
    const capital = testDb.sqlite
      .prepare(
        `SELECT (SELECT SUM(amount_minor) FROM contributions) AS contributions, (SELECT SUM(amount_minor) FROM contribution_allocations) AS allocations, (SELECT SUM(amount_minor) FROM transactions WHERE type = 'investment') AS investments`,
      )
      .get()
    expect(capital).toEqual({ contributions: 150000, allocations: 150000, investments: 345000 })
  })

  it('es idempotente: tras fusionar, el plan no tiene cuentas y repetir no cambia nada', async () => {
    const plan = await buildAccountMergePlan(testDb.db, USER, options)
    await applyAccountMergePlan(testDb.db, USER, plan, options)
    const afterFirstRun = tablesSnapshot(testDb)

    const second = await buildAccountMergePlan(testDb.db, USER, options)

    expect(second.accounts).toEqual([])
    expect(second.brokers).toEqual([])
    expect(second.closes).toEqual([])
    expect(second.movements).toEqual([])
    expect(second.alreadyMerged).toEqual(ETF_MERGES.map((merge) => merge.accountName))
    expect(await applyAccountMergePlan(testDb.db, USER, second, options)).toMatchObject({
      accountsArchived: 0,
      movementsReassigned: 0,
    })
    expect(tablesSnapshot(testDb)).toEqual(afterFirstRun)
  })

  it('no toca «Acciones» ni los movimientos de otras cuentas', async () => {
    const before = testDb.sqlite
      .prepare(
        `SELECT t.destination_account_id AS destination, d.instrument_id AS instrumentId, t.version AS version FROM transactions t JOIN investment_trade_details d ON d.transaction_id = t.id WHERE t.id = 'acciones-1'`,
      )
      .get()
    const plan = await buildAccountMergePlan(testDb.db, USER, options)
    await applyAccountMergePlan(testDb.db, USER, plan, options)

    expect(
      testDb.sqlite
        .prepare(
          `SELECT t.destination_account_id AS destination, d.instrument_id AS instrumentId, t.version AS version FROM transactions t JOIN investment_trade_details d ON d.transaction_id = t.id WHERE t.id = 'acciones-1'`,
        )
        .get(),
    ).toEqual(before)
    expect(
      testDb.sqlite
        .prepare(`SELECT alias FROM user_instruments WHERE id = 'user-inst-acciones'`)
        .get(),
    ).toEqual({ alias: 'acc-acciones' })
    expect(
      testDb.sqlite
        .prepare(`SELECT is_archived AS archived FROM accounts WHERE id = 'acc-acciones'`)
        .get(),
    ).toEqual({ archived: 0 })
    expect(
      testDb.sqlite
        .prepare(
          `SELECT b.balance_minor AS balance FROM snapshot_balances b JOIN wealth_snapshots s ON s.id = b.snapshot_id WHERE b.account_id = 'acc-acciones' ORDER BY s.month`,
        )
        .all(),
    ).toEqual([{ balance: 70000 }, { balance: 72000 }, { balance: 73000 }])
  })

  it('publica cada fila tocada en el log de sync para que los demás dispositivos la reciban', async () => {
    const plan = await buildAccountMergePlan(testDb.db, USER, options)
    await applyAccountMergePlan(testDb.db, USER, plan, options)

    const changes = testDb.sqlite
      .prepare(
        `SELECT entity_type AS entityType, entity_id AS entityId, payload FROM sync_changes WHERE user_id = ? ORDER BY revision`,
      )
      .all(USER) as { entityType: string; entityId: string; payload: string }[]
    const ids = (type: string) =>
      changes
        .filter((change) => change.entityType === type)
        .map((change) => change.entityId)
        .sort()

    expect(ids('transaction')).toEqual(
      plan.movements.map((movement) => movement.transactionId).sort(),
    )
    expect(ids('userInstrument')).toEqual([
      'user-inst-aged',
      'user-inst-iqqi',
      'user-inst-plata',
      'user-inst-sxrs',
      'user-inst-xdwh',
    ])
    expect(ids('wealthSnapshot')).toEqual(['snap-feb', 'snap-jan', 'snap-mar'])
    expect(ids('contribution')).toEqual(['contrib-1'])
    // Las cinco archivadas y Trade Republic, creada.
    expect(ids('account')).toHaveLength(6)
    const broker = testDb.sqlite
      .prepare(`SELECT id FROM accounts WHERE name = 'Trade Republic'`)
      .get() as { id: string }
    const march = JSON.parse(changes.find((change) => change.entityId === 'snap-mar')!.payload)
    expect(march.balances).toContainEqual(
      expect.objectContaining({ accountId: broker.id, balance: 3150 }),
    )
    expect(
      march.balances.some((balance: { accountId: string }) => balance.accountId === 'acc-xdwh'),
    ).toBe(false)
    const instrument = JSON.parse(
      changes.find((change) => change.entityId === 'user-inst-xdwh')!.payload,
    )
    expect(instrument.alias).toBe(broker.id)
    const revision = testDb.sqlite
      .prepare(`SELECT revision FROM user_revisions WHERE user_id = ?`)
      .get(USER) as { revision: number }
    expect(revision.revision).toBe(changes.length)
  })

  it('con Trade Republic ya creada ejecuta y conserva su saldo propio en cada cierre', async () => {
    testDb.close()
    testDb = createTestDb()
    seedEtfAccounts(testDb.sqlite, { brokerExists: true })
    const plan = await buildAccountMergePlan(testDb.db, USER, options)

    await applyAccountMergePlan(testDb.db, USER, plan, options)

    expect(
      testDb.sqlite
        .prepare(
          `SELECT s.month AS month, b.balance_minor AS balance FROM snapshot_balances b JOIN wealth_snapshots s ON s.id = b.snapshot_id WHERE b.account_id = 'acc-trade-republic' ORDER BY s.month`,
        )
        .all(),
    ).toEqual([
      { month: 1, balance: 230000 },
      { month: 2, balance: 261000 },
      { month: 3, balance: 330000 },
    ])
    expect(
      testDb.sqlite
        .prepare(`SELECT COUNT(*) AS n FROM accounts WHERE name = 'Trade Republic'`)
        .get(),
    ).toEqual({ n: 1 })
  })

  it('aborta y no escribe nada si la fusión cambiara el patrimonio o el capital aportado', async () => {
    const plan = await buildAccountMergePlan(testDb.db, USER, options)
    // Simula un fallo que corrompe datos en mitad de la ejecución.
    testDb.sqlite.exec(
      `CREATE TRIGGER corrupt_on_archive AFTER UPDATE OF is_archived ON accounts WHEN NEW.is_archived = 1 BEGIN UPDATE transactions SET amount_minor = amount_minor + 100 WHERE id = 'xdwh-1'; END`,
    )
    const before = tablesSnapshot(testDb)

    await expect(applyAccountMergePlan(testDb.db, USER, plan, options)).rejects.toThrow(
      /no se ha escrito nada/,
    )

    expect(tablesSnapshot(testDb)).toEqual(before)
  })

  it('rechaza un plan cuyos datos cambiaron desde que se calculó, sin escribir nada', async () => {
    const plan = await buildAccountMergePlan(testDb.db, USER, options)
    testDb.sqlite
      .prepare(`UPDATE snapshot_balances SET balance_minor = 99999 WHERE id = 'snap-jan-acc-xdwh'`)
      .run()
    const before = tablesSnapshot(testDb)

    await expect(applyAccountMergePlan(testDb.db, USER, plan, options)).rejects.toThrow(
      /vuelve a simularlo/,
    )

    expect(tablesSnapshot(testDb)).toEqual(before)
  })

  it('bloquea la ejecución si una cuenta no tiene instrumento al que convertirse', async () => {
    testDb.sqlite.prepare(`DELETE FROM user_instruments WHERE id = 'user-inst-plata'`).run()

    const plan = await buildAccountMergePlan(testDb.db, USER, options)

    expect(plan.blockers).toEqual([expect.stringContaining('ETF Plata')])
    const before = tablesSnapshot(testDb)
    await expect(applyAccountMergePlan(testDb.db, USER, plan, options)).rejects.toThrow(/ETF Plata/)
    expect(tablesSnapshot(testDb)).toEqual(before)
  })

  it('falla en el plan si la cuenta heredada no existe en vez de saltársela', async () => {
    await expect(
      buildAccountMergePlan(testDb.db, USER, {
        merges: [{ accountName: 'ETF Inexistente', brokerName: 'Trade Republic' }],
      }),
    ).rejects.toThrow(/ETF Inexistente/)
  })
})

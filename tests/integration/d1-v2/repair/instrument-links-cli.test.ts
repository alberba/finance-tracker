import { existsSync, mkdtempSync, readdirSync, rmSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import Database from 'better-sqlite3'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { runRepairLinksCli } from '../../../../scripts/repair-instrument-links'
import { openLocalV2Db } from '../../../../scripts/lib/local-v2-db'
import { USER, seedProductionShape } from './instrument-link-fixtures'

function unlinkedMovements(dbPath: string): number {
  const sqlite = new Database(dbPath, { readonly: true })
  try {
    const row = sqlite
      .prepare(
        `SELECT COUNT(*) AS n FROM investment_trade_details WHERE instrument_id IS NULL AND symbol IN ('BTC', 'ETH')`,
      )
      .get() as { n: number }
    return row.n
  } finally {
    sqlite.close()
  }
}

describe('db:repair-links', () => {
  let dir: string
  let dbPath: string

  beforeEach(() => {
    vi.spyOn(console, 'log').mockImplementation(() => {})
    dir = mkdtempSync(join(tmpdir(), 'repair-links-'))
    dbPath = join(dir, 'finance.sqlite')
    const local = openLocalV2Db(dbPath)
    seedProductionShape(local.sqlite)
    local.close()
  })

  afterEach(() => {
    rmSync(dir, { recursive: true, force: true })
  })

  it('por defecto simula: lista el plan y no toca la base', async () => {
    const result = await runRepairLinksCli([`--v2-sqlite=${dbPath}`, `--user-id=${USER}`])

    expect(result.executed).toBe(false)
    expect(result.plan.movements).toHaveLength(5)
    expect(unlinkedMovements(dbPath)).toBe(2)
    expect(readdirSync(dir)).toEqual(['finance.sqlite'])
  })

  it('con --execute deja una copia de la base y repara; repetirlo no cambia nada', async () => {
    const first = await runRepairLinksCli([
      `--v2-sqlite=${dbPath}`,
      `--user-id=${USER}`,
      '--execute',
    ])

    expect(first.report).toEqual({ instrumentsLinked: 5, accountsMoved: 3 })
    expect(unlinkedMovements(dbPath)).toBe(0)
    expect(unlinkedMovements(first.backupPath!)).toBe(2)

    const second = await runRepairLinksCli([
      `--v2-sqlite=${dbPath}`,
      `--user-id=${USER}`,
      '--execute',
    ])
    expect(second.plan.movements).toEqual([])
    expect(second.report).toEqual({ instrumentsLinked: 0, accountsMoved: 0 })
  })

  it('no crea una base vacía si la ruta no existe', async () => {
    const missing = join(dir, 'no-existe.sqlite')

    await expect(
      runRepairLinksCli([`--v2-sqlite=${missing}`, `--user-id=${USER}`]),
    ).rejects.toThrow(/no existe/)
    expect(existsSync(missing)).toBe(false)
  })
})

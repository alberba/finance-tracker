import { existsSync, mkdtempSync, readdirSync, rmSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import Database from 'better-sqlite3'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import {
  parseMerges,
  runMergeAccountsCli,
} from '../../../../scripts/merge-accounts-into-instruments'
import { openLocalV2Db } from '../../../../scripts/lib/local-v2-db'
import { USER, seedEtfAccounts } from './etf-merge-fixtures'

function count(dbPath: string, query: string): number {
  const sqlite = new Database(dbPath, { readonly: true })
  try {
    return (sqlite.prepare(query).get() as { n: number }).n
  } finally {
    sqlite.close()
  }
}

const ARCHIVED = `SELECT COUNT(*) AS n FROM accounts WHERE is_archived = 1`

describe('db:merge-accounts', () => {
  let dir: string
  let dbPath: string

  beforeEach(() => {
    vi.spyOn(console, 'log').mockImplementation(() => {})
    dir = mkdtempSync(join(tmpdir(), 'merge-accounts-'))
    dbPath = join(dir, 'finance.sqlite')
    const local = openLocalV2Db(dbPath)
    seedEtfAccounts(local.sqlite)
    local.close()
  })

  afterEach(() => {
    rmSync(dir, { recursive: true, force: true })
  })

  it('por defecto simula las cinco cuentas-ETF → Trade Republic y no toca la base', async () => {
    const result = await runMergeAccountsCli([`--v2-sqlite=${dbPath}`, `--user-id=${USER}`])

    expect(result.executed).toBe(false)
    expect(result.plan.accounts.map((account) => account.name)).toEqual([
      'ETF XDWH',
      'ETF IQQI',
      'ETF AGED',
      'ETF SXRS',
      'ETF Plata',
    ])
    expect(result.plan.brokers.map((broker) => broker.name)).toEqual(['Trade Republic'])
    expect(count(dbPath, ARCHIVED)).toBe(0)
    expect(readdirSync(dir)).toEqual(['finance.sqlite'])
  })

  it('con --execute deja una copia de la base y fusiona; repetirlo no cambia nada', async () => {
    const first = await runMergeAccountsCli([
      `--v2-sqlite=${dbPath}`,
      `--user-id=${USER}`,
      '--execute',
    ])

    expect(first.report).toMatchObject({ accountsArchived: 5, movementsReassigned: 7 })
    expect(count(dbPath, ARCHIVED)).toBe(5)
    expect(count(first.backupPath!, ARCHIVED)).toBe(0)

    const second = await runMergeAccountsCli([
      `--v2-sqlite=${dbPath}`,
      `--user-id=${USER}`,
      '--execute',
    ])
    expect(second.plan.accounts).toEqual([])
    expect(second.report).toMatchObject({ accountsArchived: 0 })
    expect(count(dbPath, ARCHIVED)).toBe(5)
  })

  it('la correspondencia cuenta → broker es un argumento, no algo fijo', async () => {
    const result = await runMergeAccountsCli([
      `--v2-sqlite=${dbPath}`,
      `--user-id=${USER}`,
      '--merge=ETF XDWH=Broker Uno',
      '--merge=ETF IQQI=Broker Uno',
    ])

    expect(result.plan.accounts.map((account) => [account.name, account.brokerName])).toEqual([
      ['ETF XDWH', 'Broker Uno'],
      ['ETF IQQI', 'Broker Uno'],
    ])
  })

  it('rechaza una correspondencia mal formada', () => {
    expect(() => parseMerges(['ETF XDWH'])).toThrow(/--merge/)
    expect(() => parseMerges(['=Trade Republic'])).toThrow(/--merge/)
  })

  it('no crea una base vacía si la ruta no existe', async () => {
    const missing = join(dir, 'no-existe.sqlite')

    await expect(
      runMergeAccountsCli([`--v2-sqlite=${missing}`, `--user-id=${USER}`]),
    ).rejects.toThrow(/no existe/)
    expect(existsSync(missing)).toBe(false)
  })
})

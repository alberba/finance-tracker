#!/usr/bin/env -S node
/**
 * Reparación de vínculos de inversión (#558, spec #557).
 *
 * Vincula cada movimiento de inversión sin instrumento al instrumento de su símbolo,
 * corrige los que apuntan a un instrumento de otro símbolo (tres compras de ETH sobre
 * BTC) y pasa a la cuenta indicada las compras de un símbolo (ETH → Bitvavo).
 *
 * Por defecto solo simula e imprime el plan; con `--execute` lo aplica en una
 * transacción y deja antes una copia de la base. Es idempotente.
 *
 * Uso:
 *   bun run db:repair-links --user-id=<id>
 *   bun run db:repair-links --email=<email> --v2-sqlite=/ruta/finance.sqlite --execute
 *
 * Opciones:
 *   --v2-sqlite=<ruta>   Base SQLite (por defecto: .data/finance-tracker-v2.sqlite); debe existir
 *   --email=<email>      Usuario a reparar (o --user-id)
 *   --user-id=<id>       Id del usuario a reparar
 *   --move=<SÍMBOLO>=<cuenta>
 *                        Las compras de ese símbolo pasan a la cuenta activa con ese
 *                        nombre; repetible (por defecto: ETH=Bitvavo)
 *   --execute            Aplica el plan (por defecto solo simula)
 *   --dry-run            Fuerza la simulación
 *   --json               Emite el plan en JSON; el texto humano va a stderr
 *   --help               Muestra esta ayuda
 */

import { existsSync } from 'node:fs'
import { resolve } from 'node:path'
import { parseArgs } from 'node:util'
import { runWithDb } from '../src/db/database'
import { usersRepository } from '../src/db/repositories'
import { openLocalV2Db } from './lib/local-v2-db'
import {
  applyInstrumentLinkRepairPlan,
  buildInstrumentLinkRepairPlan,
  formatInstrumentLinkRepairPlan,
  type AccountMove,
  type InstrumentLinkRepairPlan,
  type InstrumentLinkRepairReport,
} from './lib/instrument-link-repair'

const DEFAULT_MOVES: AccountMove[] = [{ symbol: 'ETH', accountName: 'Bitvavo' }]

const HELP = `
Uso: bun run db:repair-links (--user-id=<id> | --email=<email>) [opciones]

Vincula los movimientos de inversión a su instrumento y pasa las compras de un
símbolo a su cuenta. Por defecto solo simula.

Opciones:
  --v2-sqlite=<ruta>   Base SQLite (por defecto: .data/finance-tracker-v2.sqlite); debe existir
  --email=<email>      Usuario a reparar
  --user-id=<id>       Id del usuario a reparar
  --move=<SÍMBOLO>=<cuenta>
                       Las compras de ese símbolo pasan a esa cuenta; repetible
                       (por defecto: ETH=Bitvavo)
  --execute            Aplica el plan en una transacción, tras copiar la base
  --dry-run            Fuerza la simulación (sin escrituras)
  --json               Emite el plan en JSON; el texto humano va a stderr
  --help               Muestra esta ayuda
`

export function parseMoves(values: readonly string[]): AccountMove[] {
  if (values.length === 0) return DEFAULT_MOVES
  return values.map((value) => {
    const separator = value.indexOf('=')
    const symbol = value.slice(0, separator).trim()
    const accountName = value.slice(separator + 1).trim()
    if (separator < 1 || !accountName) {
      throw new Error(`--move debe ser <SÍMBOLO>=<cuenta>, no '${value}'.`)
    }
    return { symbol, accountName }
  })
}

export async function runRepairLinksCli(argv: string[]): Promise<{
  plan: InstrumentLinkRepairPlan
  executed: boolean
  report?: InstrumentLinkRepairReport
  backupPath?: string
}> {
  const { values } = parseArgs({
    args: argv,
    options: {
      'v2-sqlite': { type: 'string', default: '.data/finance-tracker-v2.sqlite' },
      email: { type: 'string' },
      'user-id': { type: 'string' },
      move: { type: 'string', multiple: true, default: [] },
      execute: { type: 'boolean', default: false },
      'dry-run': { type: 'boolean', default: false },
      json: { type: 'boolean', default: false },
      help: { type: 'boolean', default: false },
    },
  })
  if (values.help) {
    console.log(HELP)
    return { plan: { movements: [], skipped: [] }, executed: false }
  }

  // Con --json, stdout es un único documento JSON: el resto va a stderr.
  const log = values.json ? console.error : console.log
  const execute = values.execute && !values['dry-run']
  const requestedUserId = values['user-id']?.trim()
  const requestedEmail = values.email?.trim()
  if (!requestedUserId && !requestedEmail) {
    throw new Error('Pasa --email=<email> o --user-id=<id> explícitamente para seleccionar el usuario.')
  }
  const moves = parseMoves(values.move)

  // `openLocalV2Db` crea una base vacía si la ruta no existe: aquí sería un error de ruta.
  const dbPath = resolve(values['v2-sqlite'] as string)
  if (!existsSync(dbPath)) throw new Error(`La base de datos no existe: ${dbPath}`)
  const { db, sqlite, close } = openLocalV2Db(dbPath)

  try {
    let userId = requestedUserId
    if (!userId) {
      const user = await runWithDb(db, usersRepository.getByEmail(requestedEmail!))
      if (!user) throw new Error(`No se encontró ningún usuario con el email '${requestedEmail}'.`)
      userId = user.id
    }

    const plan = await buildInstrumentLinkRepairPlan(db, userId, { accountMoves: moves })
    log(formatInstrumentLinkRepairPlan(plan))

    if (!execute) {
      log('\n[SIMULACIÓN] No se ha escrito nada. Para aplicar el plan, ejecuta con --execute.')
      if (values.json) console.log(JSON.stringify({ simulation: true, plan }, null, 2))
      return { plan, executed: false }
    }

    const backupPath = `${dbPath}.antes-vinculos-${new Date().toISOString().replace(/[:.]/g, '-')}`
    await sqlite.backup(backupPath)
    log(`\nCopia de seguridad escrita en ${backupPath}`)

    const report = await applyInstrumentLinkRepairPlan(db, userId, plan)
    log(`Vinculados a su instrumento: ${report.instrumentsLinked}`)
    log(`Compras pasadas de cuenta: ${report.accountsMoved}`)
    if (values.json) console.log(JSON.stringify({ simulation: false, plan, report, backupPath }, null, 2))
    return { plan, executed: true, report, backupPath }
  } finally {
    close()
  }
}

// Solo se ejecuta cuando se lanza directamente desde la CLI.
if (import.meta.url === `file://${process.argv[1]}`) {
  runRepairLinksCli(process.argv.slice(2)).catch((error) => {
    console.error(`\nError: ${(error as Error).message}`)
    process.exitCode = 1
  })
}

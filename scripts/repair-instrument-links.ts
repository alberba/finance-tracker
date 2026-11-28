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

import { parseArgs } from 'node:util'
import { COMMON_CLI_OPTIONS, runRepairCli, runWhenMain } from './lib/repair-cli'
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
    options: { ...COMMON_CLI_OPTIONS, move: { type: 'string', multiple: true, default: [] } },
  })
  if (values.help) {
    console.log(HELP)
    return { plan: { movements: [], skipped: [] }, executed: false }
  }
  const moves = parseMoves(values.move)

  return runRepairCli(values, {
    backupLabel: 'vinculos',
    buildPlan: (db, userId) => buildInstrumentLinkRepairPlan(db, userId, { accountMoves: moves }),
    formatPlan: formatInstrumentLinkRepairPlan,
    apply: applyInstrumentLinkRepairPlan,
    reportLines: (report) => [
      `Vinculados a su instrumento: ${report.instrumentsLinked}`,
      `Compras pasadas de cuenta: ${report.accountsMoved}`,
    ],
  })
}

// Solo se ejecuta cuando se lanza directamente desde la CLI.
runWhenMain(import.meta.url, () => runRepairLinksCli(process.argv.slice(2)))

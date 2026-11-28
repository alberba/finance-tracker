#!/usr/bin/env -S node
/**
 * Fusión de las cuentas-ETF heredadas en instrumentos de una cuenta de inversión (#564, spec #557).
 *
 * «ETF XDWH», «ETF IQQI», «ETF AGED», «ETF SXRS» y «ETF Plata» no son sitios donde haya dinero: son
 * instrumentos que se tienen en Trade Republic. Suma sus saldos en cada cierre mensual en la
 * cuenta «Trade Republic» (que crea si falta), convierte cada cuenta en un instrumento de esa
 * cuenta, reasigna sus movimientos (cuenta destino + instrumento) y archiva las originales sin
 * borrarlas. La ejecución comprueba que el patrimonio de cada mes y el capital aportado son
 * idénticos antes y después y, si no, no escribe nada.
 *
 * Por defecto solo simula e imprime el plan; con `--execute` lo aplica en una transacción y deja
 * antes una copia de la base. Es idempotente.
 *
 * Uso:
 *   bun run db:merge-accounts --user-id=<id>
 *   bun run db:merge-accounts --email=<email> --v2-sqlite=/ruta/finance.sqlite --execute
 *
 * Opciones:
 *   --v2-sqlite=<ruta>   Base SQLite (por defecto: .data/finance-tracker-v2.sqlite); debe existir
 *   --email=<email>      Usuario a migrar (o --user-id)
 *   --user-id=<id>       Id del usuario a migrar
 *   --merge=<cuenta>=<cuenta de inversión>
 *                        La cuenta heredada pasa a ser instrumento de esa cuenta de inversión;
 *                        repetible (por defecto: las cinco cuentas «ETF …» → Trade Republic)
 *   --execute            Aplica el plan (por defecto solo simula)
 *   --dry-run            Fuerza la simulación
 *   --json               Emite el plan en JSON; el texto humano va a stderr
 *   --help               Muestra esta ayuda
 */

import { parseArgs } from 'node:util'
import { COMMON_CLI_OPTIONS, runRepairCli, runWhenMain } from './lib/repair-cli'
import {
  applyAccountMergePlan,
  buildAccountMergePlan,
  formatAccountMergePlan,
  type AccountMerge,
  type AccountMergePlan,
  type AccountMergeReport,
} from './lib/account-instrument-merge'

const DEFAULT_MERGES: AccountMerge[] = [
  'ETF XDWH',
  'ETF IQQI',
  'ETF AGED',
  'ETF SXRS',
  'ETF Plata',
].map((accountName) => ({ accountName, brokerName: 'Trade Republic' }))

const EMPTY_PLAN: AccountMergePlan = {
  brokers: [],
  accounts: [],
  closes: [],
  allocations: [],
  movements: [],
  alreadyMerged: [],
  blockers: [],
}

const HELP = `
Uso: bun run db:merge-accounts (--user-id=<id> | --email=<email>) [opciones]

Convierte cuentas de inversión heredadas (ETF XDWH, ETF IQQI…) en instrumentos de una única
cuenta de inversión (Trade Republic) sin cambiar el patrimonio. Por defecto solo simula.

Opciones:
  --v2-sqlite=<ruta>   Base SQLite (por defecto: .data/finance-tracker-v2.sqlite); debe existir
  --email=<email>      Usuario a migrar
  --user-id=<id>       Id del usuario a migrar
  --merge=<cuenta>=<cuenta de inversión>
                       La cuenta heredada pasa a ser instrumento de esa cuenta; repetible
                       (por defecto: ETF XDWH, IQQI, AGED, SXRS y Plata → Trade Republic)
  --execute            Aplica el plan en una transacción, tras copiar la base
  --dry-run            Fuerza la simulación (sin escrituras)
  --json               Emite el plan en JSON; el texto humano va a stderr
  --help               Muestra esta ayuda
`

export function parseMerges(values: readonly string[]): AccountMerge[] {
  if (values.length === 0) return DEFAULT_MERGES
  return values.map((value) => {
    const separator = value.lastIndexOf('=')
    const accountName = value.slice(0, separator).trim()
    const brokerName = value.slice(separator + 1).trim()
    if (separator < 1 || !accountName || !brokerName) {
      throw new Error(`--merge debe ser <cuenta>=<cuenta de inversión>, no '${value}'.`)
    }
    return { accountName, brokerName }
  })
}

export async function runMergeAccountsCli(argv: string[]): Promise<{
  plan: AccountMergePlan
  executed: boolean
  report?: AccountMergeReport
  backupPath?: string
}> {
  const { values } = parseArgs({
    args: argv,
    options: { ...COMMON_CLI_OPTIONS, merge: { type: 'string', multiple: true, default: [] } },
  })
  if (values.help) {
    console.log(HELP)
    return { plan: EMPTY_PLAN, executed: false }
  }
  const options = { merges: parseMerges(values.merge) }

  return runRepairCli(values, {
    backupLabel: 'fusion-cuentas',
    buildPlan: (db, userId) => buildAccountMergePlan(db, userId, options),
    formatPlan: formatAccountMergePlan,
    assertExecutable: (plan) => {
      if (plan.blockers.length > 0) {
        throw new Error(
          `El plan no se puede ejecutar:\n${plan.blockers.map((item) => `  - ${item}`).join('\n')}`,
        )
      }
    },
    apply: (db, userId, plan) => applyAccountMergePlan(db, userId, plan, options),
    reportLines: (report) => [
      `Cuentas archivadas: ${report.accountsArchived}`,
      `Instrumentos pasados a la cuenta de inversión: ${report.instrumentsMoved}`,
      `Cierres mensuales fusionados: ${report.closesMerged}`,
      `Aportes fusionados: ${report.allocationsMerged}`,
      `Movimientos reasignados: ${report.movementsReassigned}`,
      'Patrimonio de cada mes y capital aportado: idénticos a antes de la fusión.',
    ],
  })
}

// Solo se ejecuta cuando se lanza directamente desde la CLI.
runWhenMain(import.meta.url, () => runMergeAccountsCli(process.argv.slice(2)))

/**
 * Esqueleto común de las CLI de reparación del spec #557 (`repair-instrument-links.ts` y
 * `merge-accounts-into-instruments.ts`): opciones compartidas, usuario por email o id, copia de la
 * base antes de escribir, y la salida (texto humano y JSON). Cada CLI aporta lo suyo: el plan, su
 * texto, cómo se aplica y qué informa.
 */

import { existsSync } from 'node:fs'
import { resolve } from 'node:path'
import { runWithDb } from '../../src/db/database'
import { usersRepository } from '../../src/db/repositories'
import type { Db } from '../../src/db/repositories/shared'
import { openLocalV2Db } from './local-v2-db'

/** Opciones de `parseArgs` que comparten las dos CLI. */
export const COMMON_CLI_OPTIONS = {
  'v2-sqlite': { type: 'string', default: '.data/finance-tracker-v2.sqlite' },
  email: { type: 'string' },
  'user-id': { type: 'string' },
  execute: { type: 'boolean', default: false },
  'dry-run': { type: 'boolean', default: false },
  json: { type: 'boolean', default: false },
  help: { type: 'boolean', default: false },
} as const

export interface CommonCliValues {
  'v2-sqlite'?: string
  email?: string
  'user-id'?: string
  execute?: boolean
  'dry-run'?: boolean
  json?: boolean
  help?: boolean
}

export interface RepairCliSteps<Plan, Report> {
  /** Trozo del nombre de la copia: `finance.sqlite.antes-<etiqueta>-<fecha>`. */
  backupLabel: string
  buildPlan(db: Db, userId: string): Promise<Plan>
  formatPlan(plan: Plan): string
  /** Lanza si el plan no se puede ejecutar (se llama solo con --execute). */
  assertExecutable?(plan: Plan): void
  apply(db: Db, userId: string, plan: Plan): Promise<Report>
  /** Las líneas que resumen lo aplicado. */
  reportLines(report: Report): string[]
}

export interface RepairCliResult<Plan, Report> {
  plan: Plan
  executed: boolean
  report?: Report
  backupPath?: string
}

/** Lo que valida y ejecuta una CLI de reparación sobre la base local de un usuario. */
export async function runRepairCli<Plan, Report>(
  values: CommonCliValues,
  steps: RepairCliSteps<Plan, Report>,
): Promise<RepairCliResult<Plan, Report>> {
  // Con --json, stdout es un único documento JSON: el resto va a stderr.
  const log = values.json ? console.error : console.log
  const execute = Boolean(values.execute) && !values['dry-run']
  const requestedUserId = values['user-id']?.trim()
  const requestedEmail = values.email?.trim()
  if (!requestedUserId && !requestedEmail) {
    throw new Error('Pasa --email=<email> o --user-id=<id> explícitamente para seleccionar el usuario.')
  }

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

    const plan = await steps.buildPlan(db, userId)
    log(steps.formatPlan(plan))

    if (!execute) {
      log('\n[SIMULACIÓN] No se ha escrito nada. Para aplicar el plan, ejecuta con --execute.')
      if (values.json) console.log(JSON.stringify({ simulation: true, plan }, null, 2))
      return { plan, executed: false }
    }
    steps.assertExecutable?.(plan)

    const backupPath = `${dbPath}.antes-${steps.backupLabel}-${new Date().toISOString().replace(/[:.]/g, '-')}`
    await sqlite.backup(backupPath)
    log(`\nCopia de seguridad escrita en ${backupPath}`)

    const report = await steps.apply(db, userId, plan)
    for (const line of steps.reportLines(report)) log(line)
    if (values.json) {
      console.log(JSON.stringify({ simulation: false, plan, report, backupPath }, null, 2))
    }
    return { plan, executed: true, report, backupPath }
  } finally {
    close()
  }
}

/** Lanza la CLI solo cuando se ejecuta directamente, no cuando un test la importa. */
export function runWhenMain(moduleUrl: string, run: () => Promise<unknown>): void {
  if (moduleUrl !== `file://${process.argv[1]}`) return
  run().catch((error) => {
    console.error(`\nError: ${(error as Error).message}`)
    process.exitCode = 1
  })
}

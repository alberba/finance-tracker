#!/usr/bin/env -S node
/**
 * Issue #148 — Reparar los datos ya corrompidos en producción.
 *
 * Script de reparación ejecutado a mano y no como migración.
 * Produce su plan como un dato, lo imprime en modo simulación antes de escribir nada,
 * y exige un export de respaldo antes de ejecutar.
 *
 * Uso:
 *   # Modo simulación (por defecto, no escribe en la base de datos):
 *   pnpm db:repair --backup=ruta/al/export-2026-08-12.json --email=usuario@example.com
 *
 *   # Modo ejecución (aplica los cambios en la base de datos tras imprimir el plan):
 *   pnpm db:repair --backup=ruta/al/export-2026-08-12.json --email=usuario@example.com --execute
 *
 *   # ...y además deja el SQL para llevarlo a D1 con wrangler:
 *   pnpm db:repair --backup=ruta/al/export-2026-08-12.json --email=usuario@example.com --execute \
 *     --v2-sqlite=.data/v2-prod.sqlite --remote-sql-out=.data/reparacion-remote.sql
 *
 * Opciones:
 *   --backup=<path>       Ruta al archivo JSON de respaldo (export v1 State o RepairBackup) [exigido]
 *   --v2-sqlite=<path>    Ruta a la base de datos local SQLite v2 (por defecto: .data/finance-tracker-v2.sqlite)
 *   --email=<email>       Email explícito del usuario a reparar [exigido si no se pasa --user-id]
 *   --user-id=<id>        ID explícito del usuario a reparar
 *   --execute             Aplica los cambios tras mostrar el plan de simulación (por defecto: modo simulación)
 *   --dry-run             Fuerza el modo simulación (solo lectura)
 *   --json                Imprime el resultado como JSON
 *   --remote-sql-out=<r>  Tras --execute, escribe como SQL los cambios del plan para
 *                         `wrangler d1 execute finance-tracker-db-v2 --remote --file=<r>`
 *   --help                Muestra esta ayuda
 */

import { existsSync, readFileSync } from 'node:fs'
import { resolve } from 'node:path'
import { parseArgs } from 'node:util'
import { usersRepository } from '../src/db/repositories'
import { openLocalV2Db } from './lib/local-v2-db'
import {
  applyRepairPlan,
  buildRepairPlan,
  formatRepairPlan,
  loadRepairBackup,
  writeRemoteRepairSql,
  type RepairBackup,
  type RepairPlan,
} from './lib/repair-plan'

function parseCliArgs(argv: string[]) {
  const { values } = parseArgs({
    args: argv,
    options: {
      backup: { type: 'string' },
      'v2-sqlite': { type: 'string', default: '.data/finance-tracker-v2.sqlite' },
      email: { type: 'string' },
      'user-id': { type: 'string' },
      execute: { type: 'boolean', default: false },
      'dry-run': { type: 'boolean', default: false },
      json: { type: 'boolean', default: false },
      'remote-sql-out': { type: 'string' },
      help: { type: 'boolean', default: false },
    },
  })
  return values
}

function printHelp(): void {
  console.log(`
Uso: pnpm db:repair --backup=<ruta> [opciones]

Repara los datos corrompidos en producción (categorías duplicadas, cuentas con
tipo erróneo, celdas de presupuesto y snapshots sobrescritos).

Opciones:
  --backup=<ruta>       Ruta al archivo JSON de respaldo (export v1 State o RepairBackup) [exigido]
  --v2-sqlite=<ruta>    Ruta a la base de datos v2 SQLite (por defecto: .data/finance-tracker-v2.sqlite)
  --email=<email>       Email explícito del usuario (exigido si no se pasa --user-id)
  --user-id=<id>        ID del usuario a reparar (alternativa a --email)
  --execute             Aplica los cambios en la base de datos (por defecto solo simula)
  --dry-run             Fuerza el modo simulación (sin escrituras)
  --json                Emite el plan y reporte en formato JSON
  --remote-sql-out=<r>  Tras --execute, escribe como SQL los cambios del plan para
                        wrangler d1 execute finance-tracker-db-v2 --remote --file=<r>
  --help                Muestra esta ayuda
`)
}

export async function runRepairCli(argv: string[]): Promise<{
  plan: RepairPlan
  executed: boolean
  report?: unknown
  remoteSqlOut?: string
}> {
  const args = parseCliArgs(argv)
  if (args.help) {
    printHelp()
    return {
      plan: {
        categoryMerges: [],
        accountKindCorrections: [],
        budgetRestorations: [],
        snapshotRestorations: [],
        correlationIdFixes: [],
      },
      executed: false,
    }
  }

  const isSimulation = args['dry-run'] || !args.execute

  // With --json, stdout must stay a single parseable JSON document: every
  // human-readable trace goes to stderr instead.
  const log = args.json ? console.error : console.log

  // Acceptance criterion: Exige un export de respaldo antes de ejecutar
  if (!args.backup && !isSimulation) {
    throw new Error(
      'Se exige un export de respaldo antes de ejecutar la reparación. Pasa la ruta con --backup=<fichero.json>.',
    )
  }

  let backup: RepairBackup = { budgetCells: [], snapshots: [] }
  if (args.backup) {
    const backupPath = resolve(args.backup)
    if (!existsSync(backupPath)) {
      throw new Error(`El archivo de respaldo especificado no existe: ${backupPath}`)
    }

    let rawBackup: unknown
    try {
      rawBackup = JSON.parse(readFileSync(backupPath, 'utf8'))
    } catch (err) {
      throw new Error(`Error al leer el archivo de respaldo JSON (${backupPath}): ${(err as Error).message}`, {
        cause: err,
      })
    }
    backup = loadRepairBackup(rawBackup)
  } else {
    log(
      '\n[AVISO] No se ha especificado --backup=<ruta>. La simulación muestra fusiones de categorías y correcciones de cuentas, pero no restauraciones de presupuesto.',
    )
  }

  const requestedUserId = args['user-id']?.trim()
  const requestedEmail = args.email?.trim()
  if (!requestedUserId && !requestedEmail) {
    throw new Error('Pasa --email=<email> o --user-id=<id> explícitamente para seleccionar el usuario.')
  }

  const v2Path = resolve(args['v2-sqlite'] ?? '.data/finance-tracker-v2.sqlite')
  const { db, close } = openLocalV2Db(v2Path)

  try {
    let userId = requestedUserId
    if (!userId) {
      const email = requestedEmail!
      const user = await usersRepository.getByEmail(db, email)
      if (!user) {
        throw new Error(
          `No se encontró ningún usuario con el email '${email}'. Pasa --user-id o --email explícitamente.`,
        )
      }
      userId = user.id
    }

    // 1. Acceptance criterion: Produce su plan como un dato y lo imprime en modo simulación antes de escribir nada
    const plan = await buildRepairPlan(db, userId, backup)

    log(formatRepairPlan(plan, { simulation: true }))

    if (isSimulation) {
      log('\n[SIMULACIÓN] Modo simulación completado. Para aplicar los cambios, ejecuta con --execute.')
      if (args.json) {
        console.log(JSON.stringify({ simulation: true, plan }, null, 2))
      }
      return { plan, executed: false }
    }

    // 2. Modo ejecución: aplica el plan tras haber impreso la simulación
    log('\n[EJECUCIÓN] Aplicando el plan de reparación en la base de datos...')
    const report = await applyRepairPlan(db, userId, plan)

    // The repair only ever writes to this local copy of production, so this is
    // the step that lets the result reach D1 (no Workers runtime is available
    // from a plain Node script to talk to it directly).
    const remoteSqlOut = args['remote-sql-out']
      ? resolve(args['remote-sql-out'])
      : undefined
    const remoteSqlStatements = remoteSqlOut
      ? writeRemoteRepairSql(userId, plan, remoteSqlOut)
      : undefined

    if (args.json) {
      console.log(
        JSON.stringify({ simulation: false, plan, report, remoteSqlOut, remoteSqlStatements }, null, 2),
      )
    } else {
      log('\n======================================================================')
      log('  REPARACIÓN COMPLETADA CON ÉXITO')
      log('======================================================================')
      log(`  • Categorías fusionadas: ${report.categoryMerges}`)
      log(`  • Referencias repuntadas: ${report.referencesRepointed}`)
      log(`  • Cuentas corregidas: ${report.accountsCorrected}`)
      log(`  • Celdas de presupuesto actualizadas: ${report.budgetEntriesUpdated}`)
      log(`  • Celdas de presupuesto insertadas: ${report.budgetEntriesInserted}`)
      log(`  • Snapshots de patrimonio actualizados: ${report.snapshotsUpdated}`)
      log(`  • Snapshots de patrimonio insertados: ${report.snapshotsInserted}`)
      log(`  • Claves de correlación renombradas: ${report.correlationIdsRenamed}`)
      log('======================================================================')
      if (remoteSqlOut) {
        log(`\nSQL para D1 escrito en ${remoteSqlOut} (${remoteSqlStatements} sentencias).`)
        log(
          `Aplícalo con: wrangler d1 execute finance-tracker-db-v2 --remote --file=${remoteSqlOut}`,
        )
      }
    }

    return { plan, executed: true, report, remoteSqlOut }
  } finally {
    close()
  }
}

// Only execute when run directly from CLI
if (import.meta.url === `file://${process.argv[1]}`) {
  runRepairCli(process.argv.slice(2)).catch((error) => {
    console.error(`\nError: ${(error as Error).message}`)
    process.exitCode = 1
  })
}

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
 *   pnpm db:repair --backup=ruta/al/export-2026-08-12.json
 *
 *   # Modo ejecución (aplica los cambios en la base de datos tras imprimir el plan):
 *   pnpm db:repair --backup=ruta/al/export-2026-08-12.json --execute
 *
 * Opciones:
 *   --backup=<path>       Ruta al archivo JSON de respaldo (export v1 State o RepairBackup) [exigido]
 *   --v2-sqlite=<path>    Ruta a la base de datos local SQLite v2 (por defecto: .data/finance-tracker-v2.sqlite)
 *   --email=<email>       Email del usuario a reparar (por defecto: $LEGACY_OWNER_EMAIL o legacy-owner@finance-tracker.local)
 *   --user-id=<id>        ID explícito del usuario a reparar
 *   --execute             Aplica los cambios tras mostrar el plan de simulación (por defecto: modo simulación)
 *   --dry-run             Fuerza el modo simulación (solo lectura)
 *   --json                Imprime el resultado como JSON
 *   --help                Muestra esta ayuda
 */

import { existsSync, readFileSync } from 'node:fs'
import { resolve } from 'node:path'
import { parseArgs } from 'node:util'
import { usersRepository } from '../src/db/repositories'
import { openLocalV2Db } from './lib/migration-db'
import {
  applyRepairPlan,
  buildRepairPlan,
  formatRepairPlan,
  loadRepairBackup,
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
  --email=<email>       Email del usuario (por defecto: $LEGACY_OWNER_EMAIL o legacy-owner@finance-tracker.local)
  --user-id=<id>        ID del usuario a reparar (alternativa a --email)
  --execute             Aplica los cambios en la base de datos (por defecto solo simula)
  --dry-run             Fuerza el modo simulación (sin escrituras)
  --json                Emite el plan y reporte en formato JSON
  --help                Muestra esta ayuda
`)
}

export async function runRepairCli(argv: string[]): Promise<{
  plan: RepairPlan
  executed: boolean
  report?: unknown
}> {
  const args = parseCliArgs(argv)
  if (args.help) {
    printHelp()
    return { plan: { categoryMerges: [], accountKindCorrections: [], budgetRestorations: [], snapshotRestorations: [] }, executed: false }
  }

  // Acceptance criterion: Exige un export de respaldo antes de ejecutar
  if (!args.backup) {
    throw new Error(
      'Se exige un export de respaldo antes de ejecutar la reparación. Pasa la ruta con --backup=<fichero.json>.',
    )
  }

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

  const backup: RepairBackup = loadRepairBackup(rawBackup)

  const isSimulation = args['dry-run'] || !args.execute
  const v2Path = resolve(args['v2-sqlite'] ?? '.data/finance-tracker-v2.sqlite')
  const { db, close } = openLocalV2Db(v2Path)

  try {
    let userId = args['user-id']
    if (!userId) {
      const email =
        args.email ?? process.env.LEGACY_OWNER_EMAIL ?? 'legacy-owner@finance-tracker.local'
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

    if (args.json && isSimulation) {
      console.log(JSON.stringify({ simulation: true, plan }, null, 2))
    } else {
      console.log(formatRepairPlan(plan, { simulation: isSimulation }))
    }

    if (isSimulation) {
      console.log('\n[SIMULACIÓN] Modo simulación completado. Para aplicar los cambios, ejecuta con --execute.')
      return { plan, executed: false }
    }

    // 2. Modo ejecución: aplica el plan
    console.log('\n[EJECUCIÓN] Aplicando el plan de reparación en la base de datos...')
    const report = await applyRepairPlan(db, userId, plan)

    if (args.json) {
      console.log(JSON.stringify({ simulation: false, plan, report }, null, 2))
    } else {
      console.log('\n======================================================================')
      console.log('  REPARACIÓN COMPLETADA CON ÉXITO')
      console.log('======================================================================')
      console.log(`  • Categorías fusionadas: ${report.categoryMerges}`)
      console.log(`  • Referencias repuntadas: ${report.referencesRepointed}`)
      console.log(`  • Cuentas corregidas: ${report.accountsCorrected}`)
      console.log(`  • Celdas de presupuesto actualizadas: ${report.budgetEntriesUpdated}`)
      console.log(`  • Celdas de presupuesto insertadas: ${report.budgetEntriesInserted}`)
      console.log(`  • Snapshots de patrimonio actualizados: ${report.snapshotsUpdated}`)
      console.log(`  • Snapshots de patrimonio insertados: ${report.snapshotsInserted}`)
      console.log('======================================================================')
    }

    return { plan, executed: true, report }
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

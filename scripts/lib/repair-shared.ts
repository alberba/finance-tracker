/**
 * Piezas comunes de las reparaciones de datos del spec #557 (vínculos de inversión y fusión de
 * cuentas-ETF): publicar un cambio en `sync_changes` y resolver una cuenta activa por nombre.
 */

import { syncChanges } from '../../src/db/schema'
import { runWithDb } from '../../src/db/database'
import * as syncRepository from '../../src/db/repositories/sync'
import type { Db } from '../../src/db/repositories/shared'

/**
 * Publica el estado nuevo de una fila para los demás dispositivos: sube la revisión del usuario y
 * deja el cambio en `sync_changes`. Va dentro de la transacción de la reparación.
 */
export async function publishSyncChange(
  db: Db,
  userId: string,
  change: { entityType: string; entityId: string; payload: unknown },
  now: string,
): Promise<void> {
  const { revision } = await runWithDb(db, syncRepository.bumpRevision(userId))
  await db.insert(syncChanges).values({
    userId,
    revision,
    entityType: change.entityType,
    entityId: change.entityId,
    changeType: 'upsert',
    payload: JSON.stringify(change.payload),
    createdAt: now,
  })
}

/** Un nombre de cuenta comparado sin mayúsculas ni espacios de los bordes. */
export function normalizeName(value: string | null | undefined): string {
  return String(value ?? '')
    .trim()
    .toLowerCase()
}

export function sameName(left: string, right: string): boolean {
  return normalizeName(left) === normalizeName(right)
}

interface NamedAccount {
  name: string
  isArchived: number | boolean
}

/**
 * La cuenta activa (no archivada) con ese nombre. Con varias lanza `several`; sin ninguna
 * lanza `none` si se da y, si no, devuelve null (el llamador decide qué hacer).
 */
export function resolveActiveAccountByName<T extends NamedAccount>(
  rows: readonly T[],
  name: string,
  errors: { none?: string; several: (count: number) => string },
): T | null {
  const matches = rows.filter((row) => !row.isArchived && sameName(row.name, name))
  if (matches.length > 1) throw new Error(errors.several(matches.length))
  if (matches.length === 0 && errors.none) throw new Error(errors.none)
  return matches[0] ?? null
}

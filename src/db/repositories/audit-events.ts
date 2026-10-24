/** `audit_events` repository (WP6) — append-only audit trail. */

import { and, eq } from 'drizzle-orm'
import { lift } from '../database'
import { auditEvents } from '../schema'
import { nowIso, type Db } from './shared'

export type AuditEventRow = typeof auditEvents.$inferSelect

export interface CreateAuditEventInput {
  eventType: string
  entityType?: string | null
  entityId?: string | null
  metadata?: string | null
}

async function listByUserSql(db: Db, userId: string): Promise<AuditEventRow[]> {
  return db.select().from(auditEvents).where(eq(auditEvents.userId, userId))
}

async function getSql(db: Db, userId: string, id: string): Promise<AuditEventRow | undefined> {
  const [row] = await db
    .select()
    .from(auditEvents)
    .where(and(eq(auditEvents.id, id), eq(auditEvents.userId, userId)))
  return row
}

async function createSql(
  db: Db,
  userId: string,
  input: CreateAuditEventInput,
): Promise<AuditEventRow> {
  const [row] = await db
    .insert(auditEvents)
    .values({
      userId,
      eventType: input.eventType,
      entityType: input.entityType ?? null,
      entityId: input.entityId ?? null,
      metadata: input.metadata ?? null,
      createdAt: nowIso(),
    })
    .returning()
  return row
}

/**
 * No `update` — audit events are append-only by design. `remove` exists only
 * for retention-window cleanup tooling (WP11), not for routine use.
 */
async function removeSql(db: Db, userId: string, id: string): Promise<boolean> {
  const existing = await getSql(db, userId, id)
  if (!existing) {
    return false
  }
  await db.delete(auditEvents).where(and(eq(auditEvents.id, id), eq(auditEvents.userId, userId)))
  return true
}

async function bulkInsertSql(
  db: Db,
  userId: string,
  inputs: CreateAuditEventInput[],
): Promise<AuditEventRow[]> {
  if (inputs.length === 0) {
    return []
  }
  const now = nowIso()
  return db
    .insert(auditEvents)
    .values(
      inputs.map((input) => ({
        userId,
        eventType: input.eventType,
        entityType: input.entityType ?? null,
        entityId: input.entityId ?? null,
        metadata: input.metadata ?? null,
        createdAt: now,
      })),
    )
    .returning()
}

export const listByUser = lift(listByUserSql)
export const get = lift(getSql)
export const create = lift(createSql)
export const remove = lift(removeSql)
export const bulkInsert = lift(bulkInsertSql)

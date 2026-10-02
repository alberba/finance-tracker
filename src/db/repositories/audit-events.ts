/** `audit_events` repository (WP6) — append-only audit trail. */

import { and, eq } from "drizzle-orm";
import { auditEvents } from "../schema";
import { nowIso, type Db } from "./shared";

export type AuditEventRow = typeof auditEvents.$inferSelect;

export interface CreateAuditEventInput {
  eventType: string;
  entityType?: string | null;
  entityId?: string | null;
  metadata?: string | null;
}

export async function listByUser(db: Db, userId: string): Promise<AuditEventRow[]> {
  return db.select().from(auditEvents).where(eq(auditEvents.userId, userId));
}

export async function get(db: Db, userId: string, id: string): Promise<AuditEventRow | undefined> {
  const [row] = await db
    .select()
    .from(auditEvents)
    .where(and(eq(auditEvents.id, id), eq(auditEvents.userId, userId)));
  return row;
}

export async function create(
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
    .returning();
  return row;
}

/**
 * No `update` — audit events are append-only by design. `remove` exists only
 * for retention-window cleanup tooling (WP11), not for routine use.
 */
export async function remove(db: Db, userId: string, id: string): Promise<boolean> {
  const existing = await get(db, userId, id);
  if (!existing) {
    return false;
  }
  await db.delete(auditEvents).where(and(eq(auditEvents.id, id), eq(auditEvents.userId, userId)));
  return true;
}

export async function bulkInsert(
  db: Db,
  userId: string,
  inputs: CreateAuditEventInput[],
): Promise<AuditEventRow[]> {
  if (inputs.length === 0) {
    return [];
  }
  const now = nowIso();
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
    .returning();
}

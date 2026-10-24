/**
 * Sync/audit infrastructure repository (WP6) consumed by WP4's
 * `/api/changes` + `/api/sync` endpoints: the per-user revision cursor,
 * the idempotent command log, and the entity-change log.
 */

import { and, eq, gt, isNull, sql } from 'drizzle-orm'
import { lift } from '../database'
import { syncChanges, syncCommands, userRevisions } from '../schema'
import { nowIso, type Db } from './shared'

export type UserRevisionRow = typeof userRevisions.$inferSelect
export type SyncCommandRow = typeof syncCommands.$inferSelect
export type SyncChangeRow = typeof syncChanges.$inferSelect

export interface CreateSyncCommandInput {
  /** Client-supplied `commandId`, used as the row's primary key for idempotent replay. */
  id: string
  commandType: string
  payload: string
  status?: string
  result?: string | null
}

export interface CreateSyncChangeInput {
  revision: number
  entityType: string
  entityId: string
  changeType: string
  payload?: string | null
}

// -- user_revisions -----------------------------------------------------------

async function getRevisionSql(db: Db, userId: string): Promise<UserRevisionRow | undefined> {
  const [row] = await db.select().from(userRevisions).where(eq(userRevisions.userId, userId))
  return row
}

/** Creates the (userId → 0) cursor row if missing; a no-op if it already exists. */
async function ensureRevisionSql(db: Db, userId: string): Promise<UserRevisionRow> {
  const existing = await getRevisionSql(db, userId)
  if (existing) {
    return existing
  }
  const [row] = await db
    .insert(userRevisions)
    .values({ userId, revision: 0, updatedAt: nowIso() })
    .returning()
  return row
}

/** Bumps the user's revision cursor by one and returns the new value. */
async function bumpRevisionSql(db: Db, userId: string): Promise<UserRevisionRow> {
  await ensureRevisionSql(db, userId)
  const [row] = await db
    .update(userRevisions)
    .set({ revision: sql`${userRevisions.revision} + 1`, updatedAt: nowIso() })
    .where(eq(userRevisions.userId, userId))
    .returning()
  return row
}

async function removeRevisionSql(db: Db, userId: string): Promise<boolean> {
  const existing = await getRevisionSql(db, userId)
  if (!existing) {
    return false
  }
  await db.delete(userRevisions).where(eq(userRevisions.userId, userId))
  return true
}

// -- sync_commands --------------------------------------------------------------

async function listCommandsByUserSql(db: Db, userId: string): Promise<SyncCommandRow[]> {
  return db.select().from(syncCommands).where(eq(syncCommands.userId, userId))
}

async function getCommandSql(
  db: Db,
  userId: string,
  id: string,
): Promise<SyncCommandRow | undefined> {
  const [row] = await db
    .select()
    .from(syncCommands)
    .where(and(eq(syncCommands.id, id), eq(syncCommands.userId, userId)))
  return row
}

/**
 * Inserts a new command row. Callers implementing idempotent replay (WP4)
 * should check `getCommand` first — `id` is the client's `commandId` and is
 * the table's primary key, so a duplicate insert throws a unique-constraint
 * error rather than silently overwriting.
 */
async function createCommandSql(
  db: Db,
  userId: string,
  input: CreateSyncCommandInput,
): Promise<SyncCommandRow> {
  const [row] = await db
    .insert(syncCommands)
    .values({
      id: input.id,
      userId,
      commandType: input.commandType,
      payload: input.payload,
      status: input.status ?? 'applied',
      result: input.result ?? null,
      createdAt: nowIso(),
    })
    .returning()
  return row
}

async function finalizeCommandSql(
  db: Db,
  userId: string,
  id: string,
  status: string,
  result: string,
): Promise<SyncCommandRow | undefined> {
  const [row] = await db
    .update(syncCommands)
    .set({ status, result })
    .where(and(eq(syncCommands.id, id), eq(syncCommands.userId, userId)))
    .returning()
  return row
}

/** Atomically acquires a stale processing reservation for recovery. */
async function claimStaleCommandSql(
  db: Db,
  userId: string,
  id: string,
  previousCreatedAt: string,
  staleBefore: string,
): Promise<boolean> {
  if (previousCreatedAt > staleBefore) return false
  const rows = await db
    .update(syncCommands)
    .set({ createdAt: nowIso() })
    .where(
      and(
        eq(syncCommands.id, id),
        eq(syncCommands.userId, userId),
        eq(syncCommands.status, 'processing'),
        isNull(syncCommands.result),
        eq(syncCommands.createdAt, previousCreatedAt),
      ),
    )
    .returning({ id: syncCommands.id })
  return rows.length === 1
}

async function removeSql(db: Db, userId: string, id: string): Promise<boolean> {
  const existing = await getCommandSql(db, userId, id)
  if (!existing) {
    return false
  }
  await db.delete(syncCommands).where(and(eq(syncCommands.id, id), eq(syncCommands.userId, userId)))
  return true
}

// -- sync_changes ---------------------------------------------------------------

async function listChangesByUserSql(db: Db, userId: string): Promise<SyncChangeRow[]> {
  return db.select().from(syncChanges).where(eq(syncChanges.userId, userId))
}

/** Walks `GET /api/changes?since` — every change with `revision > since`, for this user. */
async function listChangesSinceSql(
  db: Db,
  userId: string,
  since: number,
): Promise<SyncChangeRow[]> {
  return db
    .select()
    .from(syncChanges)
    .where(and(eq(syncChanges.userId, userId), gt(syncChanges.revision, since)))
}

async function getChangeSql(
  db: Db,
  userId: string,
  id: string,
): Promise<SyncChangeRow | undefined> {
  const [row] = await db
    .select()
    .from(syncChanges)
    .where(and(eq(syncChanges.id, id), eq(syncChanges.userId, userId)))
  return row
}

async function createChangeSql(
  db: Db,
  userId: string,
  input: CreateSyncChangeInput,
): Promise<SyncChangeRow> {
  const [row] = await db
    .insert(syncChanges)
    .values({
      userId,
      revision: input.revision,
      entityType: input.entityType,
      entityId: input.entityId,
      changeType: input.changeType,
      payload: input.payload ?? null,
      createdAt: nowIso(),
    })
    .returning()
  return row
}

async function bulkInsertChangesSql(
  db: Db,
  userId: string,
  inputs: CreateSyncChangeInput[],
): Promise<SyncChangeRow[]> {
  if (inputs.length === 0) {
    return []
  }
  const now = nowIso()
  return db
    .insert(syncChanges)
    .values(
      inputs.map((input) => ({
        userId,
        revision: input.revision,
        entityType: input.entityType,
        entityId: input.entityId,
        changeType: input.changeType,
        payload: input.payload ?? null,
        createdAt: now,
      })),
    )
    .returning()
}

export const getRevision = lift(getRevisionSql)
export const ensureRevision = lift(ensureRevisionSql)
export const bumpRevision = lift(bumpRevisionSql)
export const removeRevision = lift(removeRevisionSql)
export const listCommandsByUser = lift(listCommandsByUserSql)
export const getCommand = lift(getCommandSql)
export const createCommand = lift(createCommandSql)
export const finalizeCommand = lift(finalizeCommandSql)
export const claimStaleCommand = lift(claimStaleCommandSql)
export const remove = lift(removeSql)
export const listChangesByUser = lift(listChangesByUserSql)
export const listChangesSince = lift(listChangesSinceSql)
export const getChange = lift(getChangeSql)
export const createChange = lift(createChangeSql)
export const bulkInsertChanges = lift(bulkInsertChangesSql)

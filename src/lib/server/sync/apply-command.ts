/**
 * Per-command sync-command applier (WP4), consumed by `POST /api/sync`.
 *
 * Design (per `docs/migration/work-packages.md` WP4):
 * - Each command runs in its own D1 transaction (via `db.transaction()`,
 *   which `drizzle-orm/d1` and `drizzle-orm/better-sqlite3` both implement
 *   with real `BEGIN`/`COMMIT`/`ROLLBACK`/savepoints).
 * - Idempotent replay: `sync_commands.id` (the client's `commandId`) is the
 *   table's primary key. If a command with the same id was already
 *   processed, its stored `result` is returned verbatim — the mutation is
 *   never re-applied.
 * - Optimistic concurrency: `update`/`remove` commands carry `baseVersion`;
 *   if it doesn't match the entity's current `version` column, the command
 *   is rejected as a `conflict` (equivalent to an HTTP 409) and nothing is
 *   mutated. `POST /api/sync`'s batch loop halts on the first conflict.
 * - Every successful mutation bumps the user's `user_revisions` cursor,
 *   appends a `sync_changes` row (what `GET /api/changes?since` walks), and
 *   an `audit_events` row.
 *
 * Only WP6 repositories are called here — never raw Drizzle/SQL — per the
 * "repositories are the sole caller of Drizzle" design decision.
 */

import { runInTransaction, type Db } from "../../../db/repositories/shared";
import * as accountsRepository from "../../../db/repositories/accounts";
import * as transactionsRepository from "../../../db/repositories/transactions";
import * as subscriptionsRepository from "../../../db/repositories/subscriptions";
import * as recurringRulesRepository from "../../../db/repositories/recurring-rules";
import * as pendingMovementsRepository from "../../../db/repositories/pending-movements";
import * as budgetEntriesRepository from "../../../db/repositories/budget-entries";
import * as goalsRepository from "../../../db/repositories/goals";
import * as contributionsRepository from "../../../db/repositories/contributions";
import * as marketRepository from "../../../db/repositories/market";
import * as wealthRepository from "../../../db/repositories/wealth";
import * as userSettingsRepository from "../../../db/repositories/user-settings";
import * as syncRepository from "../../../db/repositories/sync";
import * as auditEventsRepository from "../../../db/repositories/audit-events";
import {
  entityCreateSchemas,
  entityUpdateSchemas,
  type SyncCommandInput,
  type SyncEntityType,
} from "./command-schemas";

export type CommandStatus = "applied" | "conflict" | "not_found" | "noop";

export interface CommandOutcome {
  commandId: string;
  status: CommandStatus;
  replayed: boolean;
  entityType?: SyncEntityType | "userSettings";
  entityId?: string;
  entity?: unknown;
  revision?: number;
  currentVersion?: number;
  message?: string;
}

interface VersionedRow {
  id: string;
  version: number;
  [key: string]: unknown;
}

/** Looks up + version-checks an entity, returning its current row (or a not-found/conflict signal). */
async function loadForMutation(
  db: Db,
  userId: string,
  entityType: SyncEntityType,
  entityId: string,
): Promise<VersionedRow | undefined> {
  switch (entityType) {
    case "account":
      return (await accountsRepository.get(db, userId, entityId)) as VersionedRow | undefined;
    case "category":
      return (await accountsRepository.getCategory(db, userId, entityId)) as VersionedRow | undefined;
    case "transaction":
      return (await transactionsRepository.get(db, userId, entityId)) as VersionedRow | undefined;
    case "subscription":
      return (await subscriptionsRepository.get(db, userId, entityId)) as VersionedRow | undefined;
    case "recurringRule":
      return (await recurringRulesRepository.get(db, userId, entityId)) as VersionedRow | undefined;
    case "pendingMovement":
      return (await pendingMovementsRepository.get(db, userId, entityId)) as VersionedRow | undefined;
    case "budgetEntry":
      return (await budgetEntriesRepository.get(db, userId, entityId)) as VersionedRow | undefined;
    case "goal":
      return (await goalsRepository.get(db, userId, entityId)) as VersionedRow | undefined;
    case "contribution":
      return (await contributionsRepository.get(db, userId, entityId)) as VersionedRow | undefined;
    case "userInstrument":
      return (await marketRepository.getUserInstrument(db, userId, entityId)) as
        | VersionedRow
        | undefined;
    case "wealthSnapshot":
      return (await wealthRepository.get(db, userId, entityId)) as VersionedRow | undefined;
  }
}

// eslint-disable-next-line @typescript-eslint/no-explicit-any -- each entity's repository input type differs; validated by `entityCreateSchemas` before this is called.
async function createEntity(db: Db, userId: string, entityType: SyncEntityType, data: any): Promise<VersionedRow> {
  switch (entityType) {
    case "account":
      return (await accountsRepository.create(db, userId, data)) as VersionedRow;
    case "category":
      return (await accountsRepository.createCategory(db, userId, data)) as VersionedRow;
    case "transaction":
      return (await transactionsRepository.create(db, userId, data)) as VersionedRow;
    case "subscription":
      return (await subscriptionsRepository.create(db, userId, data)) as VersionedRow;
    case "recurringRule":
      return (await recurringRulesRepository.create(db, userId, data)) as VersionedRow;
    case "pendingMovement":
      return (await pendingMovementsRepository.create(db, userId, data)) as VersionedRow;
    case "budgetEntry":
      return (await budgetEntriesRepository.create(db, userId, data)) as VersionedRow;
    case "goal":
      return (await goalsRepository.create(db, userId, data)) as VersionedRow;
    case "contribution":
      return (await contributionsRepository.create(db, userId, data)) as VersionedRow;
    case "userInstrument":
      return (await marketRepository.createUserInstrument(db, userId, data)) as VersionedRow;
    case "wealthSnapshot":
      return (await wealthRepository.create(db, userId, data)) as VersionedRow;
  }
}

async function updateEntity(
  db: Db,
  userId: string,
  entityType: SyncEntityType,
  entityId: string,
  // eslint-disable-next-line @typescript-eslint/no-explicit-any -- see createEntity
  patch: any,
): Promise<VersionedRow | undefined> {
  switch (entityType) {
    case "account":
      return (await accountsRepository.update(db, userId, entityId, patch)) as VersionedRow | undefined;
    case "category":
      return (await accountsRepository.updateCategory(db, userId, entityId, patch)) as
        | VersionedRow
        | undefined;
    case "transaction":
      return (await transactionsRepository.update(db, userId, entityId, patch)) as
        | VersionedRow
        | undefined;
    case "subscription":
      return (await subscriptionsRepository.update(db, userId, entityId, patch)) as
        | VersionedRow
        | undefined;
    case "recurringRule":
      return (await recurringRulesRepository.update(db, userId, entityId, patch)) as
        | VersionedRow
        | undefined;
    case "pendingMovement":
      return (await pendingMovementsRepository.update(db, userId, entityId, patch)) as
        | VersionedRow
        | undefined;
    case "budgetEntry":
      return (await budgetEntriesRepository.update(db, userId, entityId, patch)) as
        | VersionedRow
        | undefined;
    case "goal":
      return (await goalsRepository.update(db, userId, entityId, patch)) as VersionedRow | undefined;
    case "contribution":
      return (await contributionsRepository.update(db, userId, entityId, patch)) as
        | VersionedRow
        | undefined;
    case "userInstrument":
      return (await marketRepository.updateUserInstrument(db, userId, entityId, patch)) as
        | VersionedRow
        | undefined;
    case "wealthSnapshot":
      return (await wealthRepository.update(db, userId, entityId, patch)) as VersionedRow | undefined;
  }
}

async function removeEntity(
  db: Db,
  userId: string,
  entityType: SyncEntityType,
  entityId: string,
): Promise<boolean> {
  switch (entityType) {
    case "account":
      return accountsRepository.remove(db, userId, entityId);
    case "category":
      return accountsRepository.removeCategory(db, userId, entityId);
    case "transaction":
      return transactionsRepository.remove(db, userId, entityId);
    case "subscription":
      return subscriptionsRepository.remove(db, userId, entityId);
    case "recurringRule":
      return recurringRulesRepository.remove(db, userId, entityId);
    case "pendingMovement":
      return pendingMovementsRepository.remove(db, userId, entityId);
    case "budgetEntry":
      return budgetEntriesRepository.remove(db, userId, entityId);
    case "goal":
      return goalsRepository.remove(db, userId, entityId);
    case "contribution":
      return contributionsRepository.remove(db, userId, entityId);
    case "userInstrument":
      return marketRepository.removeUserInstrument(db, userId, entityId);
    case "wealthSnapshot":
      return wealthRepository.remove(db, userId, entityId);
  }
}

/** Records the change/audit trail and bumps the revision cursor for a successful mutation. */
async function recordChange(
  db: Db,
  userId: string,
  entityType: SyncEntityType | "userSettings",
  entityId: string,
  changeType: "create" | "update" | "remove",
  payload: unknown,
): Promise<number> {
  const revisionRow = await syncRepository.bumpRevision(db, userId);
  await syncRepository.createChange(db, userId, {
    revision: revisionRow.revision,
    entityType,
    entityId,
    changeType,
    payload: payload === undefined ? null : JSON.stringify(payload),
  });
  await auditEventsRepository.create(db, userId, {
    eventType: `sync.${changeType}`,
    entityType,
    entityId,
    metadata: null,
  });
  return revisionRow.revision;
}

/** Runs the actual mutation for one command inside an already-open transaction. */
async function performMutation(
  db: Db,
  userId: string,
  command: SyncCommandInput,
): Promise<Omit<CommandOutcome, "commandId" | "replayed">> {
  switch (command.action) {
    case "noop":
      return { status: "noop" };

    case "settingsUpdate": {
      const existing = await userSettingsRepository.get(db, userId);
      const row = existing
        ? await userSettingsRepository.update(db, userId, command.patch)
        : await userSettingsRepository.create(db, userId, command.patch);
      const revision = await recordChange(db, userId, "userSettings", userId, "update", command.patch);
      return { status: "applied", entityType: "userSettings", entityId: userId, entity: row, revision };
    }

    case "create": {
      const schema = entityCreateSchemas[command.entityType];
      const parsed = schema.parse(command.data);
      const row = await createEntity(db, userId, command.entityType, parsed);
      const revision = await recordChange(db, userId, command.entityType, row.id, "create", row);
      return {
        status: "applied",
        entityType: command.entityType,
        entityId: row.id,
        entity: row,
        revision,
      };
    }

    case "update": {
      const existing = await loadForMutation(db, userId, command.entityType, command.entityId);
      if (!existing) {
        return {
          status: "not_found",
          entityType: command.entityType,
          entityId: command.entityId,
          message: "Entidad no encontrada.",
        };
      }
      if (existing.version !== command.baseVersion) {
        return {
          status: "conflict",
          entityType: command.entityType,
          entityId: command.entityId,
          currentVersion: existing.version,
          message: "La versión base no coincide con la versión actual del servidor.",
        };
      }
      const schema = entityUpdateSchemas[command.entityType];
      const parsed = schema.parse(command.patch);
      const row = await updateEntity(db, userId, command.entityType, command.entityId, parsed);
      const revision = await recordChange(
        db,
        userId,
        command.entityType,
        command.entityId,
        "update",
        row,
      );
      return {
        status: "applied",
        entityType: command.entityType,
        entityId: command.entityId,
        entity: row,
        revision,
      };
    }

    case "remove": {
      const existing = await loadForMutation(db, userId, command.entityType, command.entityId);
      if (!existing) {
        return {
          status: "not_found",
          entityType: command.entityType,
          entityId: command.entityId,
          message: "Entidad no encontrada.",
        };
      }
      if (existing.version !== command.baseVersion) {
        return {
          status: "conflict",
          entityType: command.entityType,
          entityId: command.entityId,
          currentVersion: existing.version,
          message: "La versión base no coincide con la versión actual del servidor.",
        };
      }
      await removeEntity(db, userId, command.entityType, command.entityId);
      const revision = await recordChange(
        db,
        userId,
        command.entityType,
        command.entityId,
        "remove",
        null,
      );
      return {
        status: "applied",
        entityType: command.entityType,
        entityId: command.entityId,
        revision,
      };
    }
  }
}

function isUniqueConstraintError(error: unknown): boolean {
  const message = error instanceof Error ? error.message : String(error);
  return /unique constraint|constraint failed|UNIQUE/i.test(message);
}

/**
 * Applies a single sync command, honoring idempotent replay via
 * `sync_commands`'s primary key. Never throws for expected outcomes
 * (conflict/not_found/noop) — only for genuine infra failures.
 */
export async function applyOneCommand(
  db: Db,
  userId: string,
  command: SyncCommandInput,
): Promise<CommandOutcome> {
  const existingCommand = await syncRepository.getCommand(db, userId, command.commandId);
  if (existingCommand) {
    const stored = existingCommand.result ? JSON.parse(existingCommand.result) : {};
    return { commandId: command.commandId, replayed: true, status: stored.status ?? "applied", ...stored };
  }

  try {
    return await runInTransaction(db, async (tx) => {
      const outcome = await performMutation(tx, userId, command);
      await syncRepository.createCommand(tx, userId, {
        id: command.commandId,
        commandType: command.action,
        payload: JSON.stringify(command),
        status: outcome.status,
        result: JSON.stringify(outcome),
      });
      return { commandId: command.commandId, replayed: false, ...outcome };
    });
  } catch (error) {
    if (isUniqueConstraintError(error)) {
      // Raced with another request applying the same commandId concurrently.
      const raced = await syncRepository.getCommand(db, userId, command.commandId);
      if (raced) {
        const stored = raced.result ? JSON.parse(raced.result) : {};
        return {
          commandId: command.commandId,
          replayed: true,
          status: stored.status ?? "applied",
          ...stored,
        };
      }
    }
    throw error;
  }
}

export interface SyncBatchResult {
  results: CommandOutcome[];
  revision: number;
  halted: boolean;
}

/**
 * Applies a batch of ≤5 commands, each in its own transaction (WP4 design
 * decision), halting on the first `conflict` outcome (fail-fast semantics —
 * the client must resolve the conflict before any later command in the
 * batch is considered).
 */
export async function applySyncBatch(
  db: Db,
  userId: string,
  commands: SyncCommandInput[],
): Promise<SyncBatchResult> {
  const results: CommandOutcome[] = [];
  let halted = false;
  for (const command of commands) {
    const outcome = await applyOneCommand(db, userId, command);
    results.push(outcome);
    if (outcome.status === "conflict") {
      halted = true;
      break;
    }
  }
  const revisionRow = await syncRepository.ensureRevision(db, userId);
  return { results, revision: revisionRow.revision, halted };
}

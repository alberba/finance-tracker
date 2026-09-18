/**
 * Per-command sync-command applier (WP4), consumed by `POST /api/sync`.
 *
 * Design (per `docs/migration/work-packages.md` WP4):
 * - Each command is reserved before mutation, so concurrent replay of one
 *   `commandId` is applied at most once. SQLite tests also wrap the remaining
 *   writes in a transaction; D1 executes them sequentially because it has no
 *   interactive multi-statement transaction API.
 * - Idempotent replay: `sync_commands.id` (the client's `commandId`) is the
 *   table's primary key. If a command with the same id was already
 *   processed, its stored `result` is returned verbatim — the mutation is
 *   never re-applied.
 * - Optimistic concurrency: `update`/`remove` commands carry `baseVersion`;
 *   the mutation itself includes `WHERE version = baseVersion` so two racing
 *   command ids cannot both win. A mismatch is a conflict and the batch halts.
 * - Every successful mutation bumps the user's `user_revisions` cursor,
 *   appends a `sync_changes` row (what `GET /api/changes?since` walks), and
 *   an `audit_events` row.
 *
 * Only WP6 repositories are called here — never raw Drizzle/SQL — per the
 * "repositories are the sole caller of Drizzle" design decision.
 */

import { RejectedCommandError, runInTransaction, type Db } from "../../../db/repositories/shared";
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
  entityCreatePayloadSchemas,
  entityUpdateSchemas,
  type SyncCommandInput,
  type SyncEntityType,
} from "./command-schemas";

/**
 * `rejected` is terminal: the command can never succeed as sent (invalid
 * payload, dangling reference, entity in use), so the client drops it
 * instead of blocking the FIFO outbox behind it (audit §2.1/§2.3).
 */
export type CommandStatus = "applied" | "conflict" | "not_found" | "noop" | "rejected";
const PROCESSING_LEASE_MS = 30_000;

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

/** The `balances` nested inside a `wealthSnapshot` create/update payload — see `command-schemas.ts`. */
interface WealthSnapshotBalancesField {
  balances?: Omit<wealthRepository.CreateSnapshotBalanceInput, "snapshotId">[];
}

/** The `allocations` nested inside a `contribution` create/update payload — see `command-schemas.ts`. */
interface ContributionAllocationsField {
  allocations?: Omit<contributionsRepository.CreateContributionAllocationInput, "contributionId" | "currency">[];
}

async function findByLegacyId(
  db: Db,
  userId: string,
  entityType: SyncEntityType,
  value: unknown,
): Promise<VersionedRow | undefined> {
  if (typeof value !== "string" || !value) return undefined;
  let rows: VersionedRow[] = [];
  switch (entityType) {
    case "account": rows = await accountsRepository.listByUser(db, userId) as VersionedRow[]; break;
    case "category": rows = await accountsRepository.listCategoriesByUser(db, userId) as VersionedRow[]; break;
    case "transaction": rows = await transactionsRepository.listByUser(db, userId) as VersionedRow[]; break;
    case "subscription": rows = await subscriptionsRepository.listByUser(db, userId) as VersionedRow[]; break;
    case "recurringRule": rows = await recurringRulesRepository.listByUser(db, userId) as VersionedRow[]; break;
    case "pendingMovement": rows = await pendingMovementsRepository.listByUser(db, userId) as VersionedRow[]; break;
    case "budgetEntry": rows = await budgetEntriesRepository.listByUser(db, userId) as VersionedRow[]; break;
    case "goal": rows = await goalsRepository.listByUser(db, userId) as VersionedRow[]; break;
    case "contribution": rows = await contributionsRepository.listByUser(db, userId) as VersionedRow[]; break;
    case "wealthSnapshot": rows = await wealthRepository.listByUser(db, userId) as VersionedRow[]; break;
    case "userInstrument": return undefined;
  }
  return rows.find((row) => row.legacyId === value);
}

function includesPatch(row: VersionedRow, patch: Record<string, unknown>): boolean {
  return Object.entries(patch).every(([key, value]) => JSON.stringify(row[key]) === JSON.stringify(value));
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

/**
 * Looks up the row the client's own identity addresses (ADR 0001).
 *
 * Same lookup `loadForMutation` does — an entity carrying client identity is
 * addressable by that id from its very first `create`, with no table of
 * equivalences and no waiting for an ack.
 */
async function findByClientId(
  db: Db,
  userId: string,
  entityType: SyncEntityType,
  id: unknown,
): Promise<VersionedRow | undefined> {
  if (typeof id !== "string" || !id) return undefined;
  return loadForMutation(db, userId, entityType, id);
}

// eslint-disable-next-line @typescript-eslint/no-explicit-any -- each entity's repository input type differs; validated by `entityCreatePayloadSchemas` before this is called.
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
    case "contribution": {
      const { allocations, ...contributionInput } = data as contributionsRepository.CreateContributionInput &
        ContributionAllocationsField;
      const row = await contributionsRepository.create(db, userId, contributionInput);
      const allocationRows = allocations?.length
        ? await contributionsRepository.replaceAllocations(
            db, userId, row.id, allocations.map((allocation) => ({ ...allocation, currency: row.currency })),
          )
        : [];
      return { ...row, allocations: allocationRows } as VersionedRow;
    }
    case "userInstrument":
      return (await marketRepository.createUserInstrument(db, userId, data)) as VersionedRow;
    case "wealthSnapshot": {
      const { balances, ...snapshotInput } = data as wealthRepository.CreateWealthSnapshotInput &
        WealthSnapshotBalancesField;
      const row = await wealthRepository.create(db, userId, snapshotInput);
      const balanceRows = balances?.length
        ? await wealthRepository.replaceBalances(db, userId, row.id, balances)
        : [];
      return { ...row, balances: balanceRows } as VersionedRow;
    }
  }
}

async function updateEntity(
  db: Db,
  userId: string,
  entityType: SyncEntityType,
  entityId: string,
  // eslint-disable-next-line @typescript-eslint/no-explicit-any -- see createEntity
  patch: any,
  expectedVersion: number,
): Promise<VersionedRow | undefined> {
  switch (entityType) {
    case "account":
      return (await accountsRepository.update(db, userId, entityId, patch, expectedVersion)) as VersionedRow | undefined;
    case "category":
      return (await accountsRepository.updateCategory(db, userId, entityId, patch, expectedVersion)) as
        | VersionedRow
        | undefined;
    case "transaction":
      return (await transactionsRepository.update(db, userId, entityId, patch, expectedVersion)) as
        | VersionedRow
        | undefined;
    case "subscription":
      return (await subscriptionsRepository.update(db, userId, entityId, patch, expectedVersion)) as
        | VersionedRow
        | undefined;
    case "recurringRule":
      return (await recurringRulesRepository.update(db, userId, entityId, patch, expectedVersion)) as
        | VersionedRow
        | undefined;
    case "pendingMovement":
      return (await pendingMovementsRepository.update(db, userId, entityId, patch, expectedVersion)) as
        | VersionedRow
        | undefined;
    case "budgetEntry":
      return (await budgetEntriesRepository.update(db, userId, entityId, patch, expectedVersion)) as
        | VersionedRow
        | undefined;
    case "goal":
      return (await goalsRepository.update(db, userId, entityId, patch, expectedVersion)) as VersionedRow | undefined;
    case "contribution": {
      const { allocations, ...contributionPatch } = patch as contributionsRepository.UpdateContributionInput &
        ContributionAllocationsField;
      const row = await contributionsRepository.update(db, userId, entityId, contributionPatch, expectedVersion);
      if (!row) return undefined;
      const allocationRows = allocations
        ? await contributionsRepository.replaceAllocations(
            db, userId, row.id, allocations.map((allocation) => ({ ...allocation, currency: row.currency })),
          )
        : await contributionsRepository.listAllocationsByContribution(db, userId, row.id);
      return { ...row, allocations: allocationRows } as VersionedRow;
    }
    case "userInstrument":
      return (await marketRepository.updateUserInstrument(db, userId, entityId, patch, expectedVersion)) as
        | VersionedRow
        | undefined;
    case "wealthSnapshot": {
      const { balances, ...snapshotPatch } = patch as Partial<wealthRepository.CreateWealthSnapshotInput> &
        WealthSnapshotBalancesField;
      const row = await wealthRepository.update(db, userId, entityId, snapshotPatch, expectedVersion);
      if (!row) return undefined;
      const balanceRows = balances
        ? await wealthRepository.replaceBalances(db, userId, row.id, balances)
        : await wealthRepository.listBalancesBySnapshot(db, userId, row.id);
      return { ...row, balances: balanceRows } as VersionedRow;
    }
  }
}

async function removeEntity(
  db: Db,
  userId: string,
  entityType: SyncEntityType,
  entityId: string,
  expectedVersion: number,
): Promise<boolean> {
  switch (entityType) {
    case "account":
      return accountsRepository.remove(db, userId, entityId, expectedVersion);
    case "category":
      return accountsRepository.removeCategory(db, userId, entityId, expectedVersion);
    case "transaction":
      return transactionsRepository.remove(db, userId, entityId, expectedVersion);
    case "subscription":
      return subscriptionsRepository.remove(db, userId, entityId, expectedVersion);
    case "recurringRule":
      return recurringRulesRepository.remove(db, userId, entityId, expectedVersion);
    case "pendingMovement":
      return pendingMovementsRepository.remove(db, userId, entityId, expectedVersion);
    case "budgetEntry":
      return budgetEntriesRepository.remove(db, userId, entityId, expectedVersion);
    case "goal":
      return goalsRepository.remove(db, userId, entityId, expectedVersion);
    case "contribution":
      return contributionsRepository.remove(db, userId, entityId, expectedVersion);
    case "userInstrument":
      return marketRepository.removeUserInstrument(db, userId, entityId, expectedVersion);
    case "wealthSnapshot":
      return wealthRepository.remove(db, userId, entityId, expectedVersion);
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

function rejectInvalidPayload(
  entityType: SyncEntityType,
  error: { issues: Array<{ path: PropertyKey[]; message: string }> },
): Omit<CommandOutcome, "commandId" | "replayed"> {
  const detail = error.issues.map((issue) => `${issue.path.map(String).join(".") || "(raíz)"}: ${issue.message}`).join("; ");
  return { status: "rejected", entityType, message: `Datos inválidos para ${entityType}: ${detail}` };
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
      const { twrLiquidityAccountIds, ...settingsPatch } = command.patch;
      const existing = await userSettingsRepository.get(db, userId);
      const row = existing
        ? await userSettingsRepository.update(db, userId, settingsPatch)
        : await userSettingsRepository.create(db, userId, settingsPatch);
      const twrLiquidityAccounts = twrLiquidityAccountIds
        ? await accountsRepository.replaceTwrLiquidityAccounts(db, userId, twrLiquidityAccountIds)
        : undefined;
      const revision = await recordChange(db, userId, "userSettings", userId, "update", command.patch);
      return {
        status: "applied",
        entityType: "userSettings",
        entityId: userId,
        entity: twrLiquidityAccounts ? { ...row, twrLiquidityAccounts } : row,
        revision,
      };
    }

    case "create": {
      const schema = entityCreatePayloadSchemas[command.entityType];
      const validation = schema.safeParse(command.data);
      if (!validation.success) return rejectInvalidPayload(command.entityType, validation.error);
      const parsed = validation.data;
      // The client's own identity wins when it sent one: re-sending a `create`
      // is then a no-op instead of a duplicate, even under a fresh commandId
      // that `sync_commands`'s replay guard no longer recognises. Falling back
      // to the derived identifier keeps the rows migrated from v1 reconcilable.
      const existing =
        (await findByClientId(db, userId, command.entityType, (parsed as { id?: unknown }).id))
        ?? (await findByLegacyId(
          db, userId, command.entityType, (parsed as { legacyId?: unknown }).legacyId,
        ));
      if (existing) return { status: "noop", entityType: command.entityType, entityId: existing.id, entity: existing };
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
        if (includesPatch(existing, command.patch)) {
          return { status: "noop", entityType: command.entityType, entityId: existing.id, entity: existing };
        }
        return {
          status: "conflict",
          entityType: command.entityType,
          entityId: command.entityId,
          currentVersion: existing.version,
          message: "La versión base no coincide con la versión actual del servidor.",
        };
      }
      const schema = entityUpdateSchemas[command.entityType];
      const validation = schema.safeParse(command.patch);
      if (!validation.success) return rejectInvalidPayload(command.entityType, validation.error);
      const parsed = validation.data;
      const row = await updateEntity(
        db,
        userId,
        command.entityType,
        command.entityId,
        parsed,
        command.baseVersion,
      );
      if (!row) {
        const current = await loadForMutation(db, userId, command.entityType, command.entityId);
        return current
          ? {
              status: "conflict",
              entityType: command.entityType,
              entityId: command.entityId,
              currentVersion: current.version,
              message: "La entidad cambió mientras se aplicaba el comando.",
            }
          : {
              status: "not_found",
              entityType: command.entityType,
              entityId: command.entityId,
              message: "Entidad no encontrada.",
            };
      }
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
      const removed = await removeEntity(
        db,
        userId,
        command.entityType,
        command.entityId,
        command.baseVersion,
      );
      if (!removed) {
        const current = await loadForMutation(db, userId, command.entityType, command.entityId);
        return current
          ? {
              status: "conflict",
              entityType: command.entityType,
              entityId: command.entityId,
              currentVersion: current.version,
              message: "La entidad cambió mientras se aplicaba el comando.",
            }
          : {
              status: "not_found",
              entityType: command.entityType,
              entityId: command.entityId,
              message: "Entidad no encontrada.",
            };
      }
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

export class CommandInProgressError extends Error {
  constructor(commandId: string) {
    super(`El comando ${commandId} ya se está procesando.`);
    this.name = "CommandInProgressError";
  }
}

function replayStoredCommand(
  commandId: string,
  command: syncRepository.SyncCommandRow,
): CommandOutcome {
  if (!command.result) {
    throw new CommandInProgressError(commandId);
  }
  const stored = JSON.parse(command.result) as Partial<CommandOutcome>;
  return {
    commandId,
    replayed: true,
    status: stored.status ?? "applied",
    ...stored,
  };
}

async function reserveCommand(
  db: Db,
  userId: string,
  command: SyncCommandInput,
): Promise<CommandOutcome | null> {
  const existing = await syncRepository.getCommand(db, userId, command.commandId);
  if (existing) {
    if (!existing.result) {
      const staleBefore = new Date(Date.now() - PROCESSING_LEASE_MS).toISOString();
      const claimed = await syncRepository.claimStaleCommand(
        db, userId, command.commandId, existing.createdAt, staleBefore,
      );
      if (claimed) return null;
    }
    return replayStoredCommand(command.commandId, existing);
  }
  try {
    await syncRepository.createCommand(db, userId, {
      id: command.commandId,
      commandType: command.action,
      payload: JSON.stringify(command),
      status: "processing",
      result: null,
    });
    return null;
  } catch (error) {
    if (!isUniqueConstraintError(error)) {
      throw error;
    }
    const raced = await syncRepository.getCommand(db, userId, command.commandId);
    if (!raced) {
      throw error;
    }
    return replayStoredCommand(command.commandId, raced);
  }
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
  const replay = await reserveCommand(db, userId, command);
  if (replay) {
    return replay;
  }

  try {
    return await runInTransaction(db, async (tx) => {
      const outcome = await performMutation(tx, userId, command);
      await syncRepository.finalizeCommand(
        tx,
        userId,
        command.commandId,
        outcome.status,
        JSON.stringify(outcome),
      );
      return { commandId: command.commandId, replayed: false, ...outcome };
    });
  } catch (error) {
    if (!(error instanceof RejectedCommandError)) throw error;
    // Finalize with the outer handle (the SQLite transaction was rolled
    // back; D1 has none) so the reservation never stays `processing` and a
    // replay returns the rejection. Guards throw before any write.
    const outcome: Omit<CommandOutcome, "commandId" | "replayed"> = {
      status: "rejected",
      ...("entityType" in command ? { entityType: command.entityType } : {}),
      message: error.message,
    };
    await syncRepository.finalizeCommand(db, userId, command.commandId, outcome.status, JSON.stringify(outcome));
    return { commandId: command.commandId, replayed: false, ...outcome };
  }
}

export interface SyncBatchResult {
  results: CommandOutcome[];
  revision: number;
  halted: boolean;
}

/**
 * Applies a batch of ≤5 commands, halting on the first `conflict` outcome
 * (fail-fast semantics —
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

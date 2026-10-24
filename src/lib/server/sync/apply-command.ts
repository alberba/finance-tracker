/**
 * Per-command sync-command applier (WP4), consumed by `POST /api/sync`.
 *
 * Design (per `docs/archive/work-packages.md` WP4):
 * - Each command is reserved before mutation, so concurrent replay of one
 *   `commandId` is applied at most once. Node + SQLite also wraps the remaining
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

import { assertOwnedReferences, RejectedCommandError } from '../../../db/repositories/shared'
import { Cause, Effect, Exit } from 'effect'
import { Database, DatabaseError, query, transaction } from '../../../db/database'
import { fromMinorUnits } from '../../../lib/money'
import * as accountsRepository from '../../../db/repositories/accounts'
import * as transactionsRepository from '../../../db/repositories/transactions'
import * as subscriptionsRepository from '../../../db/repositories/subscriptions'
import * as recurringRulesRepository from '../../../db/repositories/recurring-rules'
import * as pendingMovementsRepository from '../../../db/repositories/pending-movements'
import * as budgetEntriesRepository from '../../../db/repositories/budget-entries'
import * as goalsRepository from '../../../db/repositories/goals'
import * as contributionsRepository from '../../../db/repositories/contributions'
import * as marketRepository from '../../../db/repositories/market'
import * as wealthRepository from '../../../db/repositories/wealth'
import * as userSettingsRepository from '../../../db/repositories/user-settings'
import * as stockeventsSymbolMappingsRepository from '../../../db/repositories/stockevents-symbol-mappings'
import * as stockeventsCashMappingsRepository from '../../../db/repositories/stockevents-cash-mappings'
import * as syncRepository from '../../../db/repositories/sync'
import * as auditEventsRepository from '../../../db/repositories/audit-events'
import {
  entityCreatePayloadSchemas,
  entityUpdateSchemas,
  haltsBatch,
  type CommandStatus,
  type SyncCommandInput,
  type SyncEntityType,
} from './command-schemas'

const PROCESSING_LEASE_MS = 30_000

export interface CommandOutcome {
  commandId: string
  status: CommandStatus
  replayed: boolean
  entityType?: SyncEntityType | 'userSettings'
  entityId?: string
  entity?: unknown
  revision?: number
  currentVersion?: number
  message?: string
}

interface VersionedRow {
  id: string
  version: number
  [key: string]: unknown
}

/** The `balances` nested inside a `wealthSnapshot` create/update payload — see `command-schemas.ts`. */
interface WealthSnapshotBalancesField {
  balances?: Omit<wealthRepository.CreateSnapshotBalanceInput, 'snapshotId'>[]
}

/** The `allocations` nested inside a `contribution` create/update payload — see `command-schemas.ts`. */
interface ContributionAllocationsField {
  allocations?: Omit<
    contributionsRepository.CreateContributionAllocationInput,
    'contributionId' | 'currency'
  >[]
}

/**
 * Looks a row up by the identifier derived from its v1 data.
 *
 * The only remaining use of that identifier (ADR 0001): a `create` that
 * carries no client-minted `id` — a row coming from the v1 migration, or a
 * client that has not migrated that section yet — must reconcile against the
 * row already there instead of duplicating it. Everything created from now on
 * is found by its own `id` instead (`findByClientId`).
 */
function findByLegacyId(
  userId: string,
  entityType: SyncEntityType,
  value: unknown,
): Effect.Effect<VersionedRow | undefined, DatabaseError, Database> {
  return Effect.gen(function* () {
    if (typeof value !== 'string' || !value) return undefined
    if (entityType === 'transaction') {
      const row = (yield* transactionsRepository.listByUser(userId)).find(
        (candidate) => candidate.legacyId === value,
      )
      return row ? yield* transactionWithTradeDetail(userId, row) : undefined
    }
    let rows: VersionedRow[] = []
    switch (entityType) {
      case 'account':
        rows = (yield* accountsRepository.listByUser(userId)) as VersionedRow[]
        break
      case 'category':
        rows = (yield* accountsRepository.listCategoriesByUser(userId)) as VersionedRow[]
        break
      case 'subscription':
        rows = (yield* subscriptionsRepository.listByUser(userId)) as VersionedRow[]
        break
      case 'recurringRule':
        rows = (yield* recurringRulesRepository.listByUser(userId)) as VersionedRow[]
        break
      case 'pendingMovement':
        rows = (yield* pendingMovementsRepository.listByUser(userId)) as VersionedRow[]
        break
      case 'budgetEntry':
        rows = (yield* budgetEntriesRepository.listByUser(userId)) as VersionedRow[]
        break
      case 'goal':
        rows = (yield* goalsRepository.listByUser(userId)) as VersionedRow[]
        break
      case 'contribution':
        rows = (yield* contributionsRepository.listByUser(userId)) as VersionedRow[]
        break
      case 'wealthSnapshot':
        rows = (yield* wealthRepository.listByUser(userId)) as VersionedRow[]
        break
      case 'userInstrument':
        return undefined
      case 'stockeventsMapping':
        rows = (yield* stockeventsSymbolMappingsRepository.listByUser(userId)) as VersionedRow[]
        break
      case 'stockeventsCashEntry':
        return undefined
    }
    return rows.find((row) => row.legacyId === value)
  })
}

function includesPatch(row: VersionedRow, patch: Record<string, unknown>): boolean {
  return Object.entries(patch).every(
    ([key, value]) => JSON.stringify(row[key]) === JSON.stringify(value),
  )
}

/** Looks up + version-checks an entity, returning its current row (or a not-found/conflict signal). */
function loadForMutation(
  userId: string,
  entityType: SyncEntityType,
  entityId: string,
): Effect.Effect<VersionedRow | undefined, DatabaseError, Database> {
  return Effect.gen(function* () {
    switch (entityType) {
      case 'account':
        return (yield* accountsRepository.get(userId, entityId)) as VersionedRow | undefined
      case 'category':
        return (yield* accountsRepository.getCategory(userId, entityId)) as VersionedRow | undefined
      case 'transaction': {
        const row = yield* transactionsRepository.get(userId, entityId)
        return row ? yield* transactionWithTradeDetail(userId, row) : undefined
      }
      case 'subscription':
        return (yield* subscriptionsRepository.get(userId, entityId)) as VersionedRow | undefined
      case 'recurringRule':
        return (yield* recurringRulesRepository.get(userId, entityId)) as VersionedRow | undefined
      case 'pendingMovement':
        return (yield* pendingMovementsRepository.get(userId, entityId)) as VersionedRow | undefined
      case 'budgetEntry':
        return (yield* budgetEntriesRepository.get(userId, entityId)) as VersionedRow | undefined
      case 'goal':
        return (yield* goalsRepository.get(userId, entityId)) as VersionedRow | undefined
      case 'contribution':
        return (yield* contributionsRepository.get(userId, entityId)) as VersionedRow | undefined
      case 'userInstrument':
        return (yield* marketRepository.getUserInstrument(userId, entityId)) as
          VersionedRow | undefined
      case 'wealthSnapshot':
        return (yield* wealthRepository.get(userId, entityId)) as VersionedRow | undefined
      case 'stockeventsMapping':
        return (yield* stockeventsSymbolMappingsRepository.get(userId, entityId)) as
          VersionedRow | undefined
      case 'stockeventsCashEntry': {
        const entries = yield* stockeventsCashMappingsRepository.listSyncEntriesByUser(userId)
        return entries.find((entry) => entry.id === entityId) as VersionedRow | undefined
      }
    }
  })
}

function transactionWithTradeDetail(
  userId: string,
  row: VersionedRow,
): Effect.Effect<VersionedRow, DatabaseError, Database> {
  return Effect.gen(function* () {
    const tradeDetail = yield* transactionsRepository.getTradeDetailByTransaction(userId, row.id)
    return { ...row, tradeDetail } as VersionedRow
  })
}

/**
 * Looks up the row the client's own identity addresses (ADR 0001).
 *
 * Same lookup `loadForMutation` does — an entity carrying client identity is
 * addressable by that id from its very first `create`, with no table of
 * equivalences and no waiting for an ack.
 */
function findByClientId(
  userId: string,
  entityType: SyncEntityType,
  id: unknown,
): Effect.Effect<VersionedRow | undefined, DatabaseError, Database> {
  return Effect.gen(function* () {
    if (typeof id !== 'string' || !id) return undefined
    return yield* loadForMutation(userId, entityType, id)
  })
}

function createEntity(
  userId: string,
  entityType: SyncEntityType,
  // eslint-disable-next-line @typescript-eslint/no-explicit-any -- each entity's repository input type differs; validated by `entityCreatePayloadSchemas` before this is called.
  data: any,
): Effect.Effect<VersionedRow, DatabaseError, Database> {
  return Effect.gen(function* () {
    switch (entityType) {
      case 'account':
        return (yield* accountsRepository.create(userId, data)) as VersionedRow
      case 'category':
        return (yield* accountsRepository.createCategory(userId, data)) as VersionedRow
      case 'transaction':
        return (yield* transactionsRepository.create(userId, data)) as VersionedRow
      case 'subscription':
        return (yield* subscriptionsRepository.create(userId, data)) as VersionedRow
      case 'recurringRule':
        return (yield* recurringRulesRepository.create(userId, data)) as VersionedRow
      case 'pendingMovement':
        return (yield* pendingMovementsRepository.create(userId, data)) as VersionedRow
      case 'budgetEntry':
        return (yield* budgetEntriesRepository.create(userId, data)) as VersionedRow
      case 'goal':
        return (yield* goalsRepository.create(userId, data)) as VersionedRow
      case 'contribution': {
        const { allocations, ...contributionInput } =
          data as contributionsRepository.CreateContributionInput & ContributionAllocationsField
        const row = yield* contributionsRepository.create(userId, contributionInput)
        const allocationRows = allocations?.length
          ? yield* contributionsRepository.replaceAllocations(
              userId,
              row.id,
              allocations.map((allocation) => ({ ...allocation, currency: row.currency })),
            )
          : []
        return { ...row, allocations: allocationRows } as VersionedRow
      }
      case 'userInstrument':
        return (yield* marketRepository.createUserInstrument(userId, data)) as VersionedRow
      case 'stockeventsMapping':
        return (yield* stockeventsSymbolMappingsRepository.create(userId, {
          id: typeof data.id === 'string' ? data.id : undefined,
          legacyId: data.legacyId ?? null,
          categoryId: data.categoryId ?? null,
          stockeventsSymbol: String(data.stockeventsSymbol),
          sync: data.sync === true,
          watchlistId:
            typeof data.watchlistId === 'string' && data.watchlistId ? data.watchlistId : null,
          hidden: data.hidden === true,
        })) as VersionedRow
      case 'stockeventsCashEntry': {
        const accountId =
          typeof data.accountId === 'string' && data.accountId ? data.accountId : null
        if (accountId) {
          yield* query((tx) => assertOwnedReferences(tx, userId, { accountId }))
        }
        const duplicate = yield* stockeventsCashMappingsRepository.findEntry(
          userId,
          String(data.contributionDate),
          accountId,
          String(data.watchlistId),
        )
        if (duplicate) {
          return {
            ...duplicate,
            syncedAmount: fromMinorUnits(duplicate.syncedAmountMinor, duplicate.currency),
          } as VersionedRow
        }
        const entry = yield* stockeventsCashMappingsRepository.upsertSyncEntry(userId, {
          id: typeof data.id === 'string' ? data.id : undefined,
          contributionDate: String(data.contributionDate),
          accountId,
          watchlistId: String(data.watchlistId),
          syncedAmount: Number(data.syncedAmount),
          currency: String(data.currency),
        })
        return {
          ...entry,
          syncedAmount: fromMinorUnits(entry.syncedAmountMinor, entry.currency),
        } as VersionedRow
      }
      case 'wealthSnapshot': {
        const { balances, ...snapshotInput } = data as wealthRepository.CreateWealthSnapshotInput &
          WealthSnapshotBalancesField
        const row = yield* wealthRepository.create(userId, snapshotInput)
        const balanceRows = balances?.length
          ? yield* wealthRepository.replaceBalances(userId, row.id, balances)
          : []
        return { ...row, balances: balanceRows } as VersionedRow
      }
    }
  })
}

function updateEntity(
  userId: string,
  entityType: SyncEntityType,
  entityId: string,
  // eslint-disable-next-line @typescript-eslint/no-explicit-any -- see createEntity
  patch: any,
  expectedVersion: number,
): Effect.Effect<VersionedRow | undefined, DatabaseError, Database> {
  return Effect.gen(function* () {
    switch (entityType) {
      case 'account':
        return (yield* accountsRepository.update(userId, entityId, patch, expectedVersion)) as
          VersionedRow | undefined
      case 'category':
        return (yield* accountsRepository.updateCategory(
          userId,
          entityId,
          patch,
          expectedVersion,
        )) as VersionedRow | undefined
      case 'transaction': {
        const row = yield* transactionsRepository.update(userId, entityId, patch, expectedVersion)
        if (!row) return undefined
        const tradeDetail = yield* transactionsRepository.getTradeDetailByTransaction(
          userId,
          row.id,
        )
        return { ...row, tradeDetail } as VersionedRow
      }
      case 'subscription':
        return (yield* subscriptionsRepository.update(userId, entityId, patch, expectedVersion)) as
          VersionedRow | undefined
      case 'recurringRule':
        return (yield* recurringRulesRepository.update(
          userId,
          entityId,
          patch,
          expectedVersion,
        )) as VersionedRow | undefined
      case 'pendingMovement':
        return (yield* pendingMovementsRepository.update(
          userId,
          entityId,
          patch,
          expectedVersion,
        )) as VersionedRow | undefined
      case 'budgetEntry':
        return (yield* budgetEntriesRepository.update(userId, entityId, patch, expectedVersion)) as
          VersionedRow | undefined
      case 'goal':
        return (yield* goalsRepository.update(userId, entityId, patch, expectedVersion)) as
          VersionedRow | undefined
      case 'contribution': {
        const { allocations, ...contributionPatch } =
          patch as contributionsRepository.UpdateContributionInput & ContributionAllocationsField
        const row = yield* contributionsRepository.update(
          userId,
          entityId,
          contributionPatch,
          expectedVersion,
        )
        if (!row) return undefined
        const allocationRows = allocations
          ? yield* contributionsRepository.replaceAllocations(
              userId,
              row.id,
              allocations.map((allocation) => ({ ...allocation, currency: row.currency })),
            )
          : yield* contributionsRepository.listAllocationsByContribution(userId, row.id)
        return { ...row, allocations: allocationRows } as VersionedRow
      }
      case 'userInstrument':
        return (yield* marketRepository.updateUserInstrument(
          userId,
          entityId,
          patch,
          expectedVersion,
        )) as VersionedRow | undefined
      case 'stockeventsMapping':
        return (yield* stockeventsSymbolMappingsRepository.update(
          userId,
          entityId,
          {
            categoryId: patch.categoryId,
            stockeventsSymbol: patch.stockeventsSymbol,
            sync: patch.sync,
            watchlistId: patch.watchlistId,
            hidden: patch.hidden,
          },
          expectedVersion,
        )) as VersionedRow | undefined
      case 'stockeventsCashEntry': {
        const updated = yield* stockeventsCashMappingsRepository.upsertSyncEntry(userId, {
          contributionDate: String(patch.contributionDate),
          accountId:
            typeof patch.accountId === 'string' && patch.accountId ? patch.accountId : null,
          watchlistId: String(patch.watchlistId),
          syncedAmount: Number(patch.syncedAmount),
          currency: String(patch.currency),
        })
        return {
          ...updated,
          syncedAmount: fromMinorUnits(updated.syncedAmountMinor, updated.currency),
        } as VersionedRow | undefined
      }
      case 'wealthSnapshot': {
        const { balances, ...snapshotPatch } =
          patch as Partial<wealthRepository.CreateWealthSnapshotInput> & WealthSnapshotBalancesField
        const row = yield* wealthRepository.update(userId, entityId, snapshotPatch, expectedVersion)
        if (!row) return undefined
        const balanceRows = balances
          ? yield* wealthRepository.replaceBalances(userId, row.id, balances)
          : yield* wealthRepository.listBalancesBySnapshot(userId, row.id)
        return { ...row, balances: balanceRows } as VersionedRow
      }
    }
  })
}

function removeEntity(
  userId: string,
  entityType: SyncEntityType,
  entityId: string,
  expectedVersion: number,
): Effect.Effect<boolean, DatabaseError, Database> {
  return Effect.gen(function* () {
    switch (entityType) {
      case 'account':
        return yield* accountsRepository.remove(userId, entityId, expectedVersion)
      case 'category':
        return yield* accountsRepository.removeCategory(userId, entityId, expectedVersion)
      case 'transaction':
        return yield* transactionsRepository.remove(userId, entityId, expectedVersion)
      case 'subscription':
        return yield* subscriptionsRepository.remove(userId, entityId, expectedVersion)
      case 'recurringRule':
        return yield* recurringRulesRepository.remove(userId, entityId, expectedVersion)
      case 'pendingMovement':
        return yield* pendingMovementsRepository.remove(userId, entityId, expectedVersion)
      case 'budgetEntry':
        return yield* budgetEntriesRepository.remove(userId, entityId, expectedVersion)
      case 'goal':
        return yield* goalsRepository.remove(userId, entityId, expectedVersion)
      case 'contribution':
        return yield* contributionsRepository.remove(userId, entityId, expectedVersion)
      case 'userInstrument':
        return yield* marketRepository.removeUserInstrument(userId, entityId, expectedVersion)
      case 'stockeventsMapping':
        return yield* stockeventsSymbolMappingsRepository.remove(userId, entityId, expectedVersion)
      case 'stockeventsCashEntry':
        return yield* stockeventsCashMappingsRepository.removeSyncEntry(
          userId,
          entityId,
          expectedVersion,
        )
      case 'wealthSnapshot':
        return yield* wealthRepository.remove(userId, entityId, expectedVersion)
    }
  })
}

/** Records the change/audit trail and bumps the revision cursor for a successful mutation. */
function recordChange(
  userId: string,
  entityType: SyncEntityType | 'userSettings',
  entityId: string,
  changeType: 'create' | 'update' | 'remove',
  payload: unknown,
): Effect.Effect<number, DatabaseError, Database> {
  return Effect.gen(function* () {
    const revisionRow = yield* syncRepository.bumpRevision(userId)
    yield* syncRepository.createChange(userId, {
      revision: revisionRow.revision,
      entityType,
      entityId,
      changeType,
      payload: payload === undefined ? null : JSON.stringify(payload),
    })
    yield* auditEventsRepository.create(userId, {
      eventType: `sync.${changeType}`,
      entityType,
      entityId,
      metadata: null,
    })
    return revisionRow.revision
  })
}

function rejectInvalidPayload(
  entityType: SyncEntityType,
  error: { issues: ReadonlyArray<{ path: readonly PropertyKey[]; message: string }> },
): Omit<CommandOutcome, 'commandId' | 'replayed'> {
  const detail = error.issues
    .map((issue) => `${issue.path.map(String).join('.') || '(raíz)'}: ${issue.message}`)
    .join('; ')
  return {
    status: 'rejected',
    entityType,
    message: `Datos inválidos para ${entityType}: ${detail}`,
  }
}

/** Runs the actual mutation for one command inside an already-open transaction. */
function performMutation(
  userId: string,
  command: SyncCommandInput,
): Effect.Effect<Omit<CommandOutcome, 'commandId' | 'replayed'>, DatabaseError, Database> {
  return Effect.gen(function* () {
    switch (command.action) {
      case 'noop':
        return { status: 'noop' }

      case 'settingsUpdate': {
        const { twrLiquidityAccountIds, stockeventsCashMappings, ...settingsPatch } = command.patch
        // The row stores the flag as `0`/`1`; the patch carries a boolean, so
        // replay detection must compare like with like.
        const settingsPatchForCompare = {
          ...settingsPatch,
          ...(typeof settingsPatch.onboardingPresented === 'boolean'
            ? { onboardingPresented: settingsPatch.onboardingPresented ? 1 : 0 }
            : {}),
          ...(typeof settingsPatch.onboardingDismissed === 'boolean'
            ? { onboardingDismissed: settingsPatch.onboardingDismissed ? 1 : 0 }
            : {}),
          ...(typeof settingsPatch.onboardingAccountCompleted === 'boolean'
            ? { onboardingAccountCompleted: settingsPatch.onboardingAccountCompleted ? 1 : 0 }
            : {}),
          ...(typeof settingsPatch.onboardingMovementCompleted === 'boolean'
            ? { onboardingMovementCompleted: settingsPatch.onboardingMovementCompleted ? 1 : 0 }
            : {}),
          ...(typeof settingsPatch.onboardingCompleted === 'boolean'
            ? { onboardingCompleted: settingsPatch.onboardingCompleted ? 1 : 0 }
            : {}),

          ...(typeof settingsPatch.stockeventsEnabled === 'boolean'
            ? { stockeventsEnabled: settingsPatch.stockeventsEnabled ? 1 : 0 }
            : {}),
          ...(typeof settingsPatch.stockeventsTradesToCash === 'boolean'
            ? { stockeventsTradesToCash: settingsPatch.stockeventsTradesToCash ? 1 : 0 }
            : {}),
        }
        const existing = yield* userSettingsRepository.get(userId)
        // Same contract as `update`: a stale `baseVersion` is a replay when the
        // server already holds the patch, and a conflict otherwise (ADR 0003 —
        // the client rebases over `currentVersion` instead of freezing the
        // queue). `settingsPatch` is empty when the command only replaces the
        // TWR liquidity selection, and an empty patch is trivially "already
        // held", so that case must not be read as a replay: replacing the
        // selection is a write of its own.
        if (
          existing &&
          command.baseVersion !== undefined &&
          existing.version !== command.baseVersion
        ) {
          if (
            Object.keys(settingsPatch).length > 0 &&
            includesPatch(existing as unknown as VersionedRow, settingsPatchForCompare)
          ) {
            return {
              status: 'noop',
              entityType: 'userSettings',
              entityId: userId,
              entity: existing,
            }
          }
          return {
            status: 'conflict',
            entityType: 'userSettings',
            entityId: userId,
            currentVersion: existing.version,
            message: 'La versión base no coincide con la versión actual del servidor.',
          }
        }
        const row = existing
          ? yield* userSettingsRepository.update(userId, settingsPatch, command.baseVersion)
          : yield* userSettingsRepository.create(userId, settingsPatch)
        if (existing && !row) {
          const current = yield* userSettingsRepository.get(userId)
          return current
            ? {
                status: 'conflict',
                entityType: 'userSettings',
                entityId: userId,
                currentVersion: current.version,
                message: 'Los ajustes cambiaron mientras se aplicaba el comando.',
              }
            : {
                status: 'not_found',
                entityType: 'userSettings',
                entityId: userId,
                message: 'Ajustes no encontrados.',
              }
        }
        const twrLiquidityAccounts = twrLiquidityAccountIds
          ? yield* accountsRepository.replaceTwrLiquidityAccounts(userId, [
              ...twrLiquidityAccountIds,
            ])
          : undefined
        const cashMappings = stockeventsCashMappings
          ? yield* stockeventsCashMappingsRepository.replaceMappings(userId, [
              ...stockeventsCashMappings,
            ])
          : undefined
        const revision = yield* recordChange(
          userId,
          'userSettings',
          userId,
          'update',
          command.patch,
        )
        return {
          status: 'applied',
          entityType: 'userSettings',
          entityId: userId,
          entity: {
            ...row,
            ...(twrLiquidityAccounts ? { twrLiquidityAccounts } : {}),
            ...(cashMappings ? { stockeventsCashMappings: cashMappings } : {}),
          },
          revision,
        }
      }

      case 'create': {
        const schema = entityCreatePayloadSchemas[command.entityType]
        const validation = schema.safeParse(command.data)
        if (!validation.success) return rejectInvalidPayload(command.entityType, validation)
        const parsed = validation.data
        // The client's own identity wins when it sent one: re-sending a `create`
        // is then a no-op instead of a duplicate, even under a fresh commandId
        // that `sync_commands`'s replay guard no longer recognises. Falling back
        // to the derived identifier keeps the rows migrated from v1 reconcilable.
        const existing =
          (yield* findByClientId(userId, command.entityType, (parsed as { id?: unknown }).id)) ??
          (yield* findByLegacyId(
            userId,
            command.entityType,
            (parsed as { legacyId?: unknown }).legacyId,
          ))
        if (existing)
          return {
            status: 'noop',
            entityType: command.entityType,
            entityId: existing.id,
            entity: existing,
          }
        const created = yield* createEntity(userId, command.entityType, parsed)
        const row =
          command.entityType === 'transaction'
            ? yield* transactionWithTradeDetail(userId, created)
            : created
        const revision = yield* recordChange(userId, command.entityType, row.id, 'create', row)
        return {
          status: 'applied',
          entityType: command.entityType,
          entityId: row.id,
          entity: row,
          revision,
        }
      }

      case 'update': {
        const existing = yield* loadForMutation(userId, command.entityType, command.entityId)
        if (!existing) {
          return {
            status: 'not_found',
            entityType: command.entityType,
            entityId: command.entityId,
            message: 'Entidad no encontrada.',
          }
        }
        if (existing.version !== command.baseVersion) {
          if (includesPatch(existing, command.patch)) {
            return {
              status: 'noop',
              entityType: command.entityType,
              entityId: existing.id,
              entity: existing,
            }
          }
          return {
            status: 'conflict',
            entityType: command.entityType,
            entityId: command.entityId,
            currentVersion: existing.version,
            message: 'La versión base no coincide con la versión actual del servidor.',
          }
        }
        const schema = entityUpdateSchemas[command.entityType]
        const validation = schema.safeParse(command.patch)
        if (!validation.success) return rejectInvalidPayload(command.entityType, validation)
        const parsed = validation.data
        const row = yield* updateEntity(
          userId,
          command.entityType,
          command.entityId,
          parsed,
          command.baseVersion,
        )
        if (!row) {
          const current = yield* loadForMutation(userId, command.entityType, command.entityId)
          return current
            ? {
                status: 'conflict',
                entityType: command.entityType,
                entityId: command.entityId,
                currentVersion: current.version,
                message: 'La entidad cambió mientras se aplicaba el comando.',
              }
            : {
                status: 'not_found',
                entityType: command.entityType,
                entityId: command.entityId,
                message: 'Entidad no encontrada.',
              }
        }
        const revision = yield* recordChange(
          userId,
          command.entityType,
          command.entityId,
          'update',
          row,
        )
        return {
          status: 'applied',
          entityType: command.entityType,
          entityId: command.entityId,
          entity: row,
          revision,
        }
      }

      case 'remove': {
        const existing = yield* loadForMutation(userId, command.entityType, command.entityId)
        if (!existing) {
          return {
            status: 'not_found',
            entityType: command.entityType,
            entityId: command.entityId,
            message: 'Entidad no encontrada.',
          }
        }
        if (existing.version !== command.baseVersion) {
          return {
            status: 'conflict',
            entityType: command.entityType,
            entityId: command.entityId,
            currentVersion: existing.version,
            message: 'La versión base no coincide con la versión actual del servidor.',
          }
        }
        const removed = yield* removeEntity(
          userId,
          command.entityType,
          command.entityId,
          command.baseVersion,
        )
        if (!removed) {
          const current = yield* loadForMutation(userId, command.entityType, command.entityId)
          return current
            ? {
                status: 'conflict',
                entityType: command.entityType,
                entityId: command.entityId,
                currentVersion: current.version,
                message: 'La entidad cambió mientras se aplicaba el comando.',
              }
            : {
                status: 'not_found',
                entityType: command.entityType,
                entityId: command.entityId,
                message: 'Entidad no encontrada.',
              }
        }
        const revision = yield* recordChange(
          userId,
          command.entityType,
          command.entityId,
          'remove',
          null,
        )
        return {
          status: 'applied',
          entityType: command.entityType,
          entityId: command.entityId,
          revision,
        }
      }
    }
  })
}

/**
 * Detects a primary-key/unique violation through any wrapping layer.
 *
 * D1 surfaces it as `D1_ERROR: UNIQUE constraint failed: ...`, but Drizzle
 * rethrows as `DrizzleQueryError: Failed query: ...` with the D1 error as
 * `cause` — matching only the outer message misses it (FINANCE-TRACKER-6:
 * a retried command then 500s instead of replaying its stored result), so
 * the whole `cause` chain is inspected.
 */
export function isUniqueConstraintError(error: unknown): boolean {
  const pattern = /unique constraint|constraint failed/i
  let current: unknown = error
  const seen = new Set<unknown>()
  while (current !== null && current !== undefined && !seen.has(current)) {
    seen.add(current)
    const message = current instanceof Error ? current.message : String(current)
    if (pattern.test(message)) return true
    current = current instanceof Error ? current.cause : undefined
  }
  return false
}

/** Finds a `RejectedCommandError` behind the DatabaseError wrapping the driver call. */
function rejectedCommandMessage(error: unknown): string | null {
  let current: unknown = error
  const seen = new Set<unknown>()
  while (current !== null && current !== undefined && !seen.has(current)) {
    seen.add(current)
    if (current instanceof RejectedCommandError) return current.message
    current = current instanceof Error ? current.cause : undefined
  }
  return null
}

function replayStoredCommand(
  commandId: string,
  command: syncRepository.SyncCommandRow,
): CommandOutcome {
  if (!command.result) {
    return {
      commandId,
      replayed: false,
      status: 'in_progress',
      message: `El comando ${commandId} ya se está procesando.`,
    }
  }
  const stored = JSON.parse(command.result) as Partial<CommandOutcome>
  return {
    commandId,
    replayed: true,
    status: stored.status ?? 'applied',
    ...stored,
  }
}

function reserveCommand(
  userId: string,
  command: SyncCommandInput,
): Effect.Effect<CommandOutcome | null, DatabaseError, Database> {
  return Effect.gen(function* () {
    const existing = yield* syncRepository.getCommand(userId, command.commandId)
    if (existing) {
      if (!existing.result) {
        const staleBefore = new Date(Date.now() - PROCESSING_LEASE_MS).toISOString()
        const claimed = yield* syncRepository.claimStaleCommand(
          userId,
          command.commandId,
          existing.createdAt,
          staleBefore,
        )
        if (claimed) return null
      }
      return replayStoredCommand(command.commandId, existing)
    }

    const created = yield* Effect.exit(
      syncRepository.createCommand(userId, {
        id: command.commandId,
        commandType: command.action,
        payload: JSON.stringify(command),
        status: 'processing',
        result: null,
      }),
    )
    if (Exit.isSuccess(created)) return null

    // A concurrent replay of the same commandId wins the primary-key race:
    // return its stored outcome instead of failing the request.
    const failure = Cause.squash(created.cause)
    if (!(failure instanceof DatabaseError) || !isUniqueConstraintError(failure.cause)) {
      return yield* Effect.failCause(created.cause)
    }
    const raced = yield* syncRepository.getCommand(userId, command.commandId)
    if (!raced) {
      return yield* Effect.failCause(created.cause)
    }
    return replayStoredCommand(command.commandId, raced)
  })
}

/**
 * Applies a single sync command, honoring idempotent replay via
 * `sync_commands`'s primary key. Never throws for expected outcomes
 * (conflict/not_found/noop) — only for genuine infra failures.
 */
export function applyOneCommand(
  userId: string,
  command: SyncCommandInput,
): Effect.Effect<CommandOutcome, DatabaseError, Database> {
  return Effect.gen(function* () {
    const replay = yield* reserveCommand(userId, command)
    if (replay) {
      return replay
    }

    const exit = yield* Effect.exit(
      transaction(
        Effect.gen(function* () {
          const outcome = yield* performMutation(userId, command)
          yield* syncRepository.finalizeCommand(
            userId,
            command.commandId,
            outcome.status,
            JSON.stringify(outcome),
          )
          return outcome
        }),
      ),
    )
    if (Exit.isSuccess(exit)) {
      return { commandId: command.commandId, replayed: false, ...exit.value }
    }

    const message = rejectedCommandMessage(Cause.squash(exit.cause))
    if (message === null) {
      return yield* Effect.failCause(exit.cause)
    }
    // Finalize with the outer handle (the SQLite transaction was rolled
    // back; D1 has none) so the reservation never stays `processing` and a
    // replay returns the rejection. Guards throw before any write.
    const outcome: Omit<CommandOutcome, 'commandId' | 'replayed'> = {
      status: 'rejected',
      ...('entityType' in command ? { entityType: command.entityType } : {}),
      message,
    }
    yield* syncRepository.finalizeCommand(
      userId,
      command.commandId,
      outcome.status,
      JSON.stringify(outcome),
    )
    return { commandId: command.commandId, replayed: false, ...outcome }
  })
}

export interface SyncBatchResult {
  results: CommandOutcome[]
  revision: number
  halted: boolean
}

/**
 * Applies a batch of ≤5 commands, halting on the first `conflict` or
 * `in_progress` outcome (fail-fast semantics —
 * the client must resolve the conflict before any later command in the
 * batch is considered).
 */
export function applySyncBatch(
  userId: string,
  commands: SyncCommandInput[],
): Effect.Effect<SyncBatchResult, DatabaseError, Database> {
  return Effect.gen(function* () {
    const results: CommandOutcome[] = []
    let halted = false
    for (const command of commands) {
      const outcome = yield* applyOneCommand(userId, command)
      results.push(outcome)
      if (haltsBatch(outcome.status)) {
        halted = true
        break
      }
    }
    const revisionRow = yield* syncRepository.ensureRevision(userId)
    return { results, revision: revisionRow.revision, halted }
  })
}

/**
 * Effect Schema schemas for `POST /api/sync` command payloads (WP4, fase 7).
 *
 * A sync command is one of five discriminated shapes (on the `action`
 * field): `create`, `update`, `remove` (each scoped to one of the
 * `SYNC_ENTITY_TYPES` aggregates below), `settingsUpdate` (the `user_settings`
 * singleton, which has no `entityId` to address and so carries an optional
 * `baseVersion` as its only optimistic-concurrency guard), and `noop`
 * (a no-op command — useful for idempotency-replay tests without mutating
 * anything). `commandId` is the client-supplied id that becomes
 * `sync_commands.id`'s primary key, enforcing idempotent replay.
 *
 * This module used to import zod. It is shared by the client outbox and the
 * server endpoints, so moving it to Effect Schema is what takes zod out of the
 * client bundle (ADR-0006, fase 7). Objects reject excess properties through
 * `safeParse` in `src/lib/schema.ts`, the behaviour the `.strict()` zod
 * schemas provided.
 *
 * Deliberately out of scope (left for a later WP, see WP4 report):
 * `investment_trade_details` (a sub-entity of an aggregate root, not addressed
 * directly by a sync command here). Sub-entities the user edits travel nested
 * instead, the same way an investment operation travels nested inside its
 * transaction (ADR 0002) — never as their own sync command:
 * `snapshot_balances` inside `wealthSnapshot.balances`,
 * `contribution_allocations` inside `contribution.allocations`, and
 * `twr_liquidity_accounts` as the whole selection in
 * `settingsUpdate.patch.twrLiquidityAccountIds`.
 * `integration_credentials` (WP12 owns encryption semantics) and the
 * global `market_instruments`/`market_quotes` reference tables (not
 * per-user data). `stockevents_symbol_mappings` carries its own `version`
 * column, so it syncs as the `stockeventsMapping` entity; the Stock Events
 * `enabled` flag and cash mappings travel inside `settingsUpdate`.
 */

import { Schema } from 'effect'

import { validator, type Validator } from '../../schema'

const nullableString = Schema.NullOr(Schema.String)
const nonEmpty = Schema.String.check(Schema.isMinLength(1))
const optionalText = Schema.optional(nullableString)
const optionalBoolean = Schema.optional(Schema.Boolean)
const finite = Schema.Finite
const nullableFinite = Schema.NullOr(finite)
const isoDate = Schema.String.check(Schema.isPattern(/^\d{4}-\d{2}-\d{2}$/))
const int = Schema.Int
const intInRange = (minimum: number, maximum: number) =>
  Schema.Int.check(Schema.isGreaterThanOrEqualTo(minimum), Schema.isLessThanOrEqualTo(maximum))
const nonNegativeInt = Schema.Int.check(Schema.isGreaterThanOrEqualTo(0))

/** Private quote source and holdings; shared catalog definitions remain immutable. */
const quoteConfiguration = Schema.Struct({
  type: Schema.Literals(['stock', 'etf', 'fund', 'crypto']),
  symbol: Schema.String.check(Schema.isMinLength(1), Schema.isMaxLength(100)),
  quoteSymbol: Schema.optional(Schema.String.check(Schema.isMinLength(1), Schema.isMaxLength(100))),
  market: Schema.String.check(Schema.isMaxLength(100)),
  currency: Schema.String.check(Schema.isPattern(/^[A-Z]{3}$/)),
  provider: Schema.String.check(Schema.isMinLength(1), Schema.isMaxLength(50)),
  active: Schema.Boolean,
  openingUnits: Schema.optional(finite),
  holdingUnits: Schema.optional(finite.check(Schema.isGreaterThanOrEqualTo(0))),
  holdingsAsOf: Schema.optional(Schema.String),
  holdingsUpdatedAt: Schema.optional(Schema.String),
  holdingsSource: Schema.optional(Schema.Literal('manual')),
})

export const quoteConfigurationSchema = validator(quoteConfiguration)

/**
 * Outcome of one command in `POST /api/sync`'s `results`, shared with the
 * client outbox (`src/stores/sync.ts`).
 *
 * `rejected` is terminal: the command can never succeed as sent (invalid
 * payload, dangling reference, entity in use), so the client drops it
 * instead of blocking the FIFO outbox behind it (audit §2.1/§2.3).
 *
 * `in_progress` is transient: another request still holds the command's
 * reservation (a retry or second tab racing the first send). Nothing is
 * stored; the batch halts and the client resends later.
 */
export type CommandStatus =
  'applied' | 'conflict' | 'not_found' | 'noop' | 'rejected' | 'in_progress'

/** Statuses after which `applySyncBatch` stops: later commands must wait (FIFO). */
export function haltsBatch(status: CommandStatus): boolean {
  return status === 'conflict' || status === 'in_progress'
}

export const SYNC_ENTITY_TYPES = [
  'account',
  'category',
  'transaction',
  'subscription',
  'recurringRule',
  'pendingMovement',
  'budgetEntry',
  'goal',
  'contribution',
  'userInstrument',
  'wealthSnapshot',
  'stockeventsMapping',
  'stockeventsCashEntry',
] as const

export type SyncEntityType = (typeof SYNC_ENTITY_TYPES)[number]

const entityTypeSchema = Schema.Literals(SYNC_ENTITY_TYPES)

/** One account's balance nested inside a `wealthSnapshot` command — see the module doc comment. */
const wealthSnapshotBalance = Schema.Struct({
  accountId: Schema.String.check(Schema.isMinLength(1)),
  balance: finite,
  currency: Schema.String.check(Schema.isMinLength(1)),
})

/** One account's share of a contribution's flow, nested inside a `contribution` command. */
const contributionAllocation = Schema.Struct({
  accountId: nullableString,
  amount: finite,
})

/**
 * The operation ("Operación", CONTEXT.md) that gives an investment movement
 * its content. A recurring rule and a pending movement are both a movement
 * template, so both carry it — and both leave it absent when they are not
 * investments.
 */
const operationFields = {
  symbol: optionalText,
  side: optionalText,
  units: Schema.optional(nullableFinite),
  unitPrice: Schema.optional(nullableFinite),
  fee: Schema.optional(nullableFinite),
  time: optionalText,
}

/**
 * The same operation, as it travels nested inside a movement's command. The
 * movement's own `time` lives beside it on the movement, not in here.
 */
export const transactionOperationSchema = validator(
  Schema.Struct({
    symbol: optionalText,
    instrumentId: optionalText,
    side: nonEmpty,
    units: finite,
    unitPrice: finite,
    fee: finite,
  }),
)

/** Create-payload shape per entity type, mirroring each repository's `Create*Input`. */
const entityCreateFields = {
  account: {
    legacyId: optionalText,
    name: nonEmpty,
    kind: nonEmpty,
    currency: nonEmpty,
    openingBalance: finite,
    isArchived: optionalBoolean,
  },
  category: {
    legacyId: optionalText,
    name: nonEmpty,
    kind: nonEmpty,
    sortOrder: Schema.optional(int),
    emoji: optionalText,
  },
  transaction: {
    legacyId: optionalText,
    accountId: nonEmpty,
    categoryId: optionalText,
    // Only a saving (ahorro) carries one; it travels in the movement's own command (ADR 0007).
    destinationAccountId: optionalText,
    type: nonEmpty,
    date: nonEmpty,
    description: optionalText,
    amount: finite,
    currency: nonEmpty,
    // `time` and `declared` are the movement's own, not the operation's: a
    // gasto can carry an hour and be marked as declarado too (ADR 0002).
    time: optionalText,
    declared: optionalBoolean,
    // 1-12; `null` counts the movement in the month of its date.
    accountingMonth: Schema.optional(Schema.NullOr(intInRange(1, 12))),
    // Nested, so amount and operation are written in the same command and
    // cannot drift apart. `null` says this movement has no operation.
    operation: Schema.optional(Schema.NullOr(transactionOperationSchema.schema)),
  },
  subscription: {
    legacyId: optionalText,
    name: nonEmpty,
    categoryId: optionalText,
    categoryName: Schema.optional(nonEmpty),
    accountId: optionalText,
    amount: finite,
    currency: nonEmpty,
    startDate: isoDate,
    nextChargeDate: isoDate,
    frequency: nonEmpty,
    isActive: optionalBoolean,
  },
  recurringRule: {
    legacyId: optionalText,
    name: nonEmpty,
    type: nonEmpty,
    accountId: optionalText,
    destinationAccountId: optionalText,
    categoryId: optionalText,
    amount: finite,
    currency: nonEmpty,
    frequency: nonEmpty,
    interval: Schema.optional(Schema.Int.check(Schema.isGreaterThanOrEqualTo(1))),
    startDate: optionalText,
    endDate: optionalText,
    lastExecutionDate: optionalText,
    nextRunDate: optionalText,
    ...operationFields,
    status: Schema.optional(Schema.String),
  },
  pendingMovement: {
    legacyId: optionalText,
    recurringRuleId: nonEmpty,
    accountId: optionalText,
    destinationAccountId: optionalText,
    categoryId: optionalText,
    amount: finite,
    currency: nonEmpty,
    dueDate: nonEmpty,
    type: optionalText,
    description: optionalText,
    ...operationFields,
    transactionId: optionalText,
    status: Schema.optional(Schema.String),
  },
  budgetEntry: {
    legacyId: optionalText,
    categoryId: nonEmpty,
    year: int,
    month: intInRange(1, 12),
    amount: finite,
    currency: nonEmpty,
  },
  goal: {
    legacyId: optionalText,
    key: nonEmpty,
    categoryId: optionalText,
    name: nonEmpty,
    targetYear: Schema.optional(Schema.NullOr(int)),
    targetAmount: finite,
    currency: nonEmpty,
  },
  contribution: {
    legacyId: optionalText,
    date: nonEmpty,
    amount: finite,
    currency: nonEmpty,
    portfolioDate: optionalText,
    portfolioValue: Schema.optional(nullableFinite),
    flow: Schema.optional(nullableFinite),
    allocations: Schema.optional(Schema.Array(contributionAllocation)),
  },
  userInstrument: {
    instrumentId: nonEmpty,
    categoryId: optionalText,
    alias: optionalText,
    quoteConfig: Schema.optional(quoteConfiguration),
  },
  wealthSnapshot: {
    legacyId: optionalText,
    snapshotDate: nonEmpty,
    year: int,
    month: intInRange(1, 12),
    balances: Schema.optional(Schema.Array(wealthSnapshotBalance)),
  },
  stockeventsMapping: {
    legacyId: optionalText,
    categoryId: optionalText,
    stockeventsSymbol: nonEmpty,
    sync: optionalBoolean,
    watchlistId: optionalText,
    hidden: optionalBoolean,
  },
  stockeventsCashEntry: {
    legacyId: optionalText,
    contributionDate: isoDate,
    accountId: optionalText,
    watchlistId: nonEmpty,
    syncedAmount: finite,
    currency: nonEmpty,
  },
} satisfies Record<SyncEntityType, Schema.Struct.Fields>

/**
 * What a `create` command may actually carry: the per-entity shape above plus
 * `id`, the identity the client minted for the entity (ADR 0001).
 *
 * Kept apart from `entityCreateSchemas` on purpose — the update schemas below
 * derive from that map, and an entity's identity is not a patchable field.
 */
const clientIdentityFields = { id: Schema.optional(nonEmpty) }

type CreateFields = typeof entityCreateFields
type PayloadFields = {
  [K in keyof CreateFields]: CreateFields[K] & typeof clientIdentityFields
}
type PartialFields<F> = F extends Schema.Struct.Fields
  ? { [P in keyof F]: Schema.optionalKey<F[P] extends Schema.Constraint ? F[P] : never> }
  : never
type UpdateFields = { [K in keyof CreateFields]: PartialFields<CreateFields[K]> }

const payloadFields = Object.fromEntries(
  Object.entries(entityCreateFields).map(([entityType, fields]) => [
    entityType,
    { ...fields, ...clientIdentityFields },
  ]),
) as PayloadFields

const updateFields = {
  ...Object.fromEntries(
    Object.entries(entityCreateFields).map(([entityType, fields]) => [
      entityType,
      Object.fromEntries(
        Object.entries(fields).map(([field, schema]) => [field, Schema.optionalKey(schema)]),
      ),
    ]),
  ),
  // These four entities accept a deliberately narrower patch than their
  // create payload: identity and grouping live outside the editable fields.
  budgetEntry: { amount: Schema.optional(finite), currency: Schema.optional(nonEmpty) },
  userInstrument: {
    categoryId: optionalText,
    alias: optionalText,
    quoteConfig: Schema.optional(quoteConfiguration),
  },
  stockeventsMapping: {
    categoryId: optionalText,
    stockeventsSymbol: Schema.optional(nonEmpty),
    sync: optionalBoolean,
    watchlistId: optionalText,
    hidden: optionalBoolean,
  },
  stockeventsCashEntry: {
    contributionDate: Schema.optional(isoDate),
    accountId: optionalText,
    watchlistId: Schema.optional(nonEmpty),
    syncedAmount: Schema.optional(finite),
    currency: Schema.optional(nonEmpty),
  },
} as unknown as UpdateFields

type EntitySchema = Schema.Schema<Record<string, unknown>>

const createSchemas = Object.fromEntries(
  Object.entries(entityCreateFields).map(([entityType, fields]) => [
    entityType,
    Schema.Struct(fields),
  ]),
) as unknown as Record<SyncEntityType, EntitySchema>

const payloadSchemas = Object.fromEntries(
  Object.entries(payloadFields).map(([entityType, fields]) => [entityType, Schema.Struct(fields)]),
) as unknown as Record<SyncEntityType, EntitySchema>

const updateSchemas = Object.fromEntries(
  Object.entries(updateFields).map(([entityType, fields]) => [entityType, Schema.Struct(fields)]),
) as unknown as Record<SyncEntityType, EntitySchema>

export const entityCreateSchemas: Record<
  SyncEntityType,
  Validator<Record<string, unknown>>
> = Object.fromEntries(
  Object.entries(createSchemas).map(([entityType, schema]) => [entityType, validator(schema)]),
) as Record<SyncEntityType, Validator<Record<string, unknown>>>

export const entityCreatePayloadSchemas: Record<
  SyncEntityType,
  Validator<Record<string, unknown>>
> = Object.fromEntries(
  Object.entries(payloadSchemas).map(([entityType, schema]) => [entityType, validator(schema)]),
) as Record<SyncEntityType, Validator<Record<string, unknown>>>

/** Update-payload (patch) shape per entity type — every field optional. */
export const entityUpdateSchemas: Record<
  SyncEntityType,
  Validator<Record<string, unknown>>
> = Object.fromEntries(
  Object.entries(updateSchemas).map(([entityType, schema]) => [entityType, validator(schema)]),
) as Record<SyncEntityType, Validator<Record<string, unknown>>>

const baseCommandFields = {
  commandId: nonEmpty,
}

export const createCommandSchema = validator(
  Schema.Struct({
    ...baseCommandFields,
    action: Schema.Literal('create'),
    entityType: entityTypeSchema,
    data: Schema.Record(Schema.String, Schema.Unknown),
  }),
)

export const updateCommandSchema = validator(
  Schema.Struct({
    ...baseCommandFields,
    action: Schema.Literal('update'),
    entityType: entityTypeSchema,
    entityId: nonEmpty,
    baseVersion: nonNegativeInt,
    patch: Schema.Record(Schema.String, Schema.Unknown),
  }),
)

export const removeCommandSchema = validator(
  Schema.Struct({
    ...baseCommandFields,
    action: Schema.Literal('remove'),
    entityType: entityTypeSchema,
    entityId: nonEmpty,
    baseVersion: nonNegativeInt,
  }),
)

/**
 * `user_settings` is a per-user singleton: addressed by `userId` alone, so
 * there is no `entityId` to point at. `baseVersion` is the row's `version` as
 * the client last saw it, sent when the client knows one, so a settings write
 * from a device that is behind is a conflict the queue rebases instead of
 * silently overwriting the other device's currency or theme (audit §6.4).
 * Optional because a client that has never seen the row still creates it.
 */
export const settingsUpdateCommandSchema = validator(
  Schema.Struct({
    ...baseCommandFields,
    action: Schema.Literal('settingsUpdate'),
    baseVersion: Schema.optional(nonNegativeInt),
    patch: Schema.Struct({
      onboardingPresented: optionalBoolean,
      onboardingDismissed: optionalBoolean,
      onboardingAccountCompleted: optionalBoolean,
      onboardingMovementCompleted: optionalBoolean,
      onboardingCompleted: optionalBoolean,
      currency: Schema.optional(nonEmpty),
      locale: optionalText,
      theme: optionalText,
      /** Server `account` ids — replaces the whole TWR liquidity selection. */
      twrLiquidityAccountIds: Schema.optional(Schema.Array(nonEmpty)),
      /** Stock Events "sincronizar nuevos movimientos" flag. */
      stockeventsEnabled: optionalBoolean,
      /** Stock Events: buys/sells move the watchlist cash (`toCash`). */
      stockeventsTradesToCash: optionalBoolean,
      /**
       * Whole Stock Events cash-mapping selection — replaces it. `accountId`
       * is the server `account` id (`null` clears that row's mapping only
       * when paired with an empty `watchlistId`; entries with an empty
       * `watchlistId` remove the mapping).
       */
      stockeventsCashMappings: Schema.optional(
        Schema.Array(
          Schema.Struct({
            accountId: nullableString,
            watchlistId: Schema.String,
          }),
        ),
      ),
    }),
  }),
)

/** No-op command: exercises idempotent replay without touching any table. */
export const noopCommandSchema = validator(
  Schema.Struct({
    ...baseCommandFields,
    action: Schema.Literal('noop'),
  }),
)

const syncCommand = Schema.Union([
  createCommandSchema.schema,
  updateCommandSchema.schema,
  removeCommandSchema.schema,
  settingsUpdateCommandSchema.schema,
  noopCommandSchema.schema,
])

export const syncCommandSchema = validator(syncCommand)

export type SyncCommandInput = Schema.Schema.Type<typeof syncCommand>

/** `POST /api/sync` batches at most 5 commands per request (WP4 design decision). */
export const syncBatchSchema = validator(
  Schema.Struct({
    commands: Schema.Array(syncCommand).check(Schema.isMinLength(1), Schema.isMaxLength(5)),
  }),
)

export type SyncBatchInput = {
  readonly commands: readonly SyncCommandInput[]
}

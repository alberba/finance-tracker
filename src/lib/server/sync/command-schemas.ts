/**
 * Zod schemas for `POST /api/sync` command payloads (WP4).
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

import { z } from "zod";

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
export type CommandStatus = "applied" | "conflict" | "not_found" | "noop" | "rejected" | "in_progress";

/** Statuses after which `applySyncBatch` stops: later commands must wait (FIFO). */
export function haltsBatch(status: CommandStatus): boolean {
  return status === "conflict" || status === "in_progress";
}

export const SYNC_ENTITY_TYPES = [
  "account",
  "category",
  "transaction",
  "subscription",
  "recurringRule",
  "pendingMovement",
  "budgetEntry",
  "goal",
  "contribution",
  "userInstrument",
  "wealthSnapshot",
  "stockeventsMapping",
  "stockeventsCashEntry",
] as const;

export type SyncEntityType = (typeof SYNC_ENTITY_TYPES)[number];

const entityTypeSchema = z.enum(SYNC_ENTITY_TYPES);

const nullableString = z.string().nullable();
const isoDate = z.string().regex(/^\d{4}-\d{2}-\d{2}$/);

/** One account's balance nested inside a `wealthSnapshot` command — see the module doc comment. */
const wealthSnapshotBalanceSchema = z.object({
  accountId: z.string().min(1),
  balance: z.number(),
  currency: z.string().min(1),
});

/** One account's share of a contribution's flow, nested inside a `contribution` command. */
const contributionAllocationSchema = z.object({
  accountId: nullableString,
  amount: z.number(),
});

/**
 * The operation ("Operación", CONTEXT.md) that gives an investment movement
 * its content. A recurring rule and a pending movement are both a movement
 * template, so both carry it — and both leave it absent when they are not
 * investments.
 */
const operationFields = {
  symbol: nullableString.optional(),
  side: nullableString.optional(),
  units: z.number().nullable().optional(),
  unitPrice: z.number().nullable().optional(),
  fee: z.number().nullable().optional(),
  time: nullableString.optional(),
};

/**
 * The same operation, as it travels nested inside a movement's command. The
 * movement's own `time` lives beside it on the movement, not in here.
 */
const operationSchema = z.object({
  symbol: nullableString.optional(),
  instrumentId: nullableString.optional(),
  side: z.string().min(1),
  units: z.number(),
  unitPrice: z.number(),
  fee: z.number(),
});

/** Create-payload shape per entity type, mirroring each repository's `Create*Input`. */
export const entityCreateSchemas = {
  account: z
    .object({
      legacyId: nullableString.optional(),
      name: z.string().min(1),
      kind: z.string().min(1),
      currency: z.string().min(1),
      openingBalance: z.number(),
      isArchived: z.boolean().optional(),
    })
    .strict(),
  category: z
    .object({
      legacyId: nullableString.optional(),
      name: z.string().min(1),
      kind: z.string().min(1),
      sortOrder: z.number().int().optional(),
      emoji: nullableString.optional(),
    })
    .strict(),
  transaction: z
    .object({
      legacyId: nullableString.optional(),
      accountId: z.string().min(1),
      categoryId: nullableString.optional(),
      type: z.string().min(1),
      date: z.string().min(1),
      description: nullableString.optional(),
      amount: z.number(),
      currency: z.string().min(1),
      // `time` and `declared` are the movement's own, not the operation's: a
      // gasto can carry an hour and be marked as declarado too (ADR 0002).
      time: nullableString.optional(),
      declared: z.boolean().optional(),
      // Nested, so amount and operation are written in the same command and
      // cannot drift apart. `null` says this movement has no operation.
      operation: operationSchema.nullable().optional(),
    })
    .strict(),
  subscription: z
    .object({
      legacyId: nullableString.optional(),
      name: z.string().min(1),
      categoryId: nullableString.optional(),
      categoryName: z.string().min(1).optional(),
      accountId: nullableString.optional(),
      amount: z.number(),
      currency: z.string().min(1),
      startDate: isoDate,
      nextChargeDate: isoDate,
      frequency: z.string().min(1),
      isActive: z.boolean().optional(),
    })
    .strict(),
  recurringRule: z
    .object({
      legacyId: nullableString.optional(),
      name: z.string().min(1),
      type: z.string().min(1),
      accountId: nullableString.optional(),
      categoryId: nullableString.optional(),
      amount: z.number(),
      currency: z.string().min(1),
      frequency: z.string().min(1),
      interval: z.number().int().min(1).optional(),
      startDate: nullableString.optional(),
      endDate: nullableString.optional(),
      lastExecutionDate: nullableString.optional(),
      nextRunDate: nullableString.optional(),
      ...operationFields,
      status: z.string().optional(),
    })
    .strict(),
  pendingMovement: z
    .object({
      legacyId: nullableString.optional(),
      recurringRuleId: z.string().min(1),
      accountId: nullableString.optional(),
      categoryId: nullableString.optional(),
      amount: z.number(),
      currency: z.string().min(1),
      dueDate: z.string().min(1),
      type: nullableString.optional(),
      description: nullableString.optional(),
      ...operationFields,
      transactionId: nullableString.optional(),
      status: z.string().optional(),
    })
    .strict(),
  budgetEntry: z
    .object({
      legacyId: nullableString.optional(),
      categoryId: z.string().min(1),
      year: z.number().int(),
      month: z.number().int().min(1).max(12),
      amount: z.number(),
      currency: z.string().min(1),
    })
    .strict(),
  goal: z
    .object({
      legacyId: nullableString.optional(),
      key: z.string().min(1),
      name: z.string().min(1),
      targetYear: z.number().int().nullable().optional(),
      targetAmount: z.number(),
      currency: z.string().min(1),
    })
    .strict(),
  contribution: z
    .object({
      legacyId: nullableString.optional(),
      date: z.string().min(1),
      amount: z.number(),
      currency: z.string().min(1),
      portfolioDate: nullableString.optional(),
      portfolioValue: z.number().nullable().optional(),
      flow: z.number().nullable().optional(),
      allocations: z.array(contributionAllocationSchema).optional(),
    })
    .strict(),
  userInstrument: z
    .object({
      instrumentId: z.string().min(1),
      categoryId: nullableString.optional(),
      alias: nullableString.optional(),
    })
    .strict(),
  wealthSnapshot: z
    .object({
      legacyId: nullableString.optional(),
      snapshotDate: z.string().min(1),
      year: z.number().int(),
      month: z.number().int().min(1).max(12),
      balances: z.array(wealthSnapshotBalanceSchema).optional(),
    })
    .strict(),
  stockeventsMapping: z
    .object({
      legacyId: nullableString.optional(),
      categoryId: nullableString.optional(),
      stockeventsSymbol: z.string().min(1),
      sync: z.boolean().optional(),
      watchlistId: nullableString.optional(),
      hidden: z.boolean().optional(),
    })
    .strict(),
  stockeventsCashEntry: z
    .object({
      legacyId: nullableString.optional(),
      contributionDate: isoDate,
      accountId: nullableString.optional(),
      watchlistId: z.string().min(1),
      syncedAmount: z.number(),
      currency: z.string().min(1),
    })
    .strict(),
} satisfies Record<SyncEntityType, z.ZodTypeAny>;

/**
 * What a `create` command may actually carry: the per-entity shape above plus
 * `id`, the identity the client minted for the entity (ADR 0001).
 *
 * Kept apart from `entityCreateSchemas` on purpose — the update schemas below
 * derive from that map, and an entity's identity is not a patchable field.
 */
const clientIdentityFields = { id: z.string().min(1).optional() };

export const entityCreatePayloadSchemas = {
  account: entityCreateSchemas.account.extend(clientIdentityFields),
  category: entityCreateSchemas.category.extend(clientIdentityFields),
  transaction: entityCreateSchemas.transaction.extend(clientIdentityFields),
  subscription: entityCreateSchemas.subscription.extend(clientIdentityFields),
  recurringRule: entityCreateSchemas.recurringRule.extend(clientIdentityFields),
  pendingMovement: entityCreateSchemas.pendingMovement.extend(clientIdentityFields),
  budgetEntry: entityCreateSchemas.budgetEntry.extend(clientIdentityFields),
  goal: entityCreateSchemas.goal.extend(clientIdentityFields),
  contribution: entityCreateSchemas.contribution.extend(clientIdentityFields),
  userInstrument: entityCreateSchemas.userInstrument.extend(clientIdentityFields),
  wealthSnapshot: entityCreateSchemas.wealthSnapshot.extend(clientIdentityFields),
  stockeventsMapping: entityCreateSchemas.stockeventsMapping.extend(clientIdentityFields),
  stockeventsCashEntry: entityCreateSchemas.stockeventsCashEntry.extend(clientIdentityFields),
} satisfies Record<SyncEntityType, z.ZodTypeAny>;

/** Update-payload (patch) shape per entity type — every field optional. */
export const entityUpdateSchemas = {
  account: entityCreateSchemas.account.partial(),
  category: entityCreateSchemas.category.partial(),
  transaction: entityCreateSchemas.transaction.partial(),
  subscription: entityCreateSchemas.subscription.partial(),
  recurringRule: entityCreateSchemas.recurringRule.partial(),
  pendingMovement: entityCreateSchemas.pendingMovement.partial(),
  budgetEntry: z
    .object({
      amount: z.number().optional(),
      currency: z.string().min(1).optional(),
    })
    .strict(),
  goal: entityCreateSchemas.goal.partial(),
  contribution: entityCreateSchemas.contribution.partial(),
  userInstrument: z
    .object({
      categoryId: nullableString.optional(),
      alias: nullableString.optional(),
    })
    .strict(),
  wealthSnapshot: entityCreateSchemas.wealthSnapshot.partial(),
  stockeventsMapping: z
    .object({
      categoryId: nullableString.optional(),
      stockeventsSymbol: z.string().min(1).optional(),
      sync: z.boolean().optional(),
      watchlistId: nullableString.optional(),
      hidden: z.boolean().optional(),
    })
    .strict(),
  stockeventsCashEntry: z
    .object({
      contributionDate: isoDate.optional(),
      accountId: nullableString.optional(),
      watchlistId: z.string().min(1).optional(),
      syncedAmount: z.number().optional(),
      currency: z.string().min(1).optional(),
    })
    .strict(),
} satisfies Record<SyncEntityType, z.ZodTypeAny>;

const baseCommandFields = {
  commandId: z.string().min(1),
};

export const createCommandSchema = z.object({
  ...baseCommandFields,
  action: z.literal("create"),
  entityType: entityTypeSchema,
  data: z.record(z.string(), z.unknown()),
});

export const updateCommandSchema = z.object({
  ...baseCommandFields,
  action: z.literal("update"),
  entityType: entityTypeSchema,
  entityId: z.string().min(1),
  baseVersion: z.number().int().nonnegative(),
  patch: z.record(z.string(), z.unknown()),
});

export const removeCommandSchema = z.object({
  ...baseCommandFields,
  action: z.literal("remove"),
  entityType: entityTypeSchema,
  entityId: z.string().min(1),
  baseVersion: z.number().int().nonnegative(),
});

/**
 * `user_settings` is a per-user singleton: addressed by `userId` alone, so
 * there is no `entityId` to point at. `baseVersion` is the row's `version` as
 * the client last saw it, sent when the client knows one, so a settings write
 * from a device that is behind is a conflict the queue rebases instead of
 * silently overwriting the other device's currency or theme (audit §6.4).
 * Optional because a client that has never seen the row still creates it.
 */
export const settingsUpdateCommandSchema = z.object({
  ...baseCommandFields,
  action: z.literal("settingsUpdate"),
  baseVersion: z.number().int().nonnegative().optional(),
  patch: z.object({
    currency: z.string().min(1).optional(),
    locale: nullableString.optional(),
    theme: nullableString.optional(),
    /** Server `account` ids — replaces the whole TWR liquidity selection. */
    twrLiquidityAccountIds: z.array(z.string().min(1)).optional(),
    /** Stock Events "sincronizar nuevos movimientos" flag. */
    stockeventsEnabled: z.boolean().optional(),
    /** Stock Events: buys/sells move the watchlist cash (`toCash`). */
    stockeventsTradesToCash: z.boolean().optional(),
    /**
     * Whole Stock Events cash-mapping selection — replaces it. `accountId`
     * is the server `account` id (`null` clears that row's mapping only
     * when paired with an empty `watchlistId`; entries with an empty
     * `watchlistId` remove the mapping).
     */
    stockeventsCashMappings: z
      .array(
        z.object({
          accountId: nullableString,
          watchlistId: z.string(),
        }),
      )
      .optional(),
  }),
});

/** No-op command: exercises idempotent replay without touching any table. */
export const noopCommandSchema = z.object({
  ...baseCommandFields,
  action: z.literal("noop"),
});

export const syncCommandSchema = z.discriminatedUnion("action", [
  createCommandSchema,
  updateCommandSchema,
  removeCommandSchema,
  settingsUpdateCommandSchema,
  noopCommandSchema,
]);

export type SyncCommandInput = z.infer<typeof syncCommandSchema>;

/** `POST /api/sync` batches at most 5 commands per request (WP4 design decision). */
export const syncBatchSchema = z.object({
  commands: z.array(syncCommandSchema).min(1).max(5),
});

export type SyncBatchInput = z.infer<typeof syncBatchSchema>;

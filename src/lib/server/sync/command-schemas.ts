/**
 * Zod schemas for `POST /api/sync` command payloads (WP4).
 *
 * A sync command is one of five discriminated shapes (on the `action`
 * field): `create`, `update`, `remove` (each scoped to one of the
 * `SYNC_ENTITY_TYPES` aggregates below), `settingsUpdate` (the `user_settings`
 * singleton, which has no `id`/`version` of its own to address), and `noop`
 * (a no-op command — useful for idempotency-replay tests without mutating
 * anything). `commandId` is the client-supplied id that becomes
 * `sync_commands.id`'s primary key, enforcing idempotent replay.
 *
 * Deliberately out of scope (left for a later WP, see WP4 report):
 * `investment_trade_details`, `contribution_allocations`,
 * `snapshot_balances`, `twr_liquidity_accounts` (sub-entities of an
 * aggregate root, not addressed directly by a sync command here),
 * `stockevents_symbol_mappings` (no `version` column to drive optimistic
 * concurrency), `integration_credentials` (WP12 owns encryption semantics),
 * and the global `market_instruments`/`market_quotes` reference tables
 * (not per-user data).
 */

import { z } from "zod";

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
] as const;

export type SyncEntityType = (typeof SYNC_ENTITY_TYPES)[number];

const entityTypeSchema = z.enum(SYNC_ENTITY_TYPES);

const nullableString = z.string().nullable();
const isoDate = z.string().regex(/^\d{4}-\d{2}-\d{2}$/);

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
      nextRunDate: nullableString.optional(),
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

/** `user_settings` is a per-user singleton — addressed by `userId` alone, no `entityId`/`baseVersion`. */
export const settingsUpdateCommandSchema = z.object({
  ...baseCommandFields,
  action: z.literal("settingsUpdate"),
  patch: z.object({
    currency: z.string().min(1).optional(),
    locale: nullableString.optional(),
    theme: nullableString.optional(),
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

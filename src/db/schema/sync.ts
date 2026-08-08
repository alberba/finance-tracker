/**
 * Sync/audit infrastructure consumed by WP4's `/api/changes` + `/api/sync`
 * endpoints. `sync_commands.id` doubles as the client-supplied `commandId`
 * used for idempotent replay (a repeated `POST /api/sync` with the same
 * `commandId` must return the prior result, not re-apply the mutation).
 */

import { sqliteTable, text, integer, index } from "drizzle-orm/sqlite-core";
import { idColumn, createdAtColumn } from "./_helpers";
import { users } from "./users";

/** Per-user monotonic revision cursor, walked by `GET /api/changes?since`. */
export const userRevisions = sqliteTable(
  "user_revisions",
  {
    userId: text("user_id")
      .primaryKey()
      .references(() => users.id),
    revision: integer("revision").notNull().default(0),
    updatedAt: text("updated_at").notNull(),
  },
  (table) => [index("user_revisions_user_id_idx").on(table.userId)],
);

/**
 * A client-submitted sync command. `id` IS the client's `commandId` — the
 * primary key itself enforces idempotency on replay (`INSERT ... ON
 * CONFLICT(id) DO NOTHING`-style handling happens in WP4's apply-command).
 */
export const syncCommands = sqliteTable(
  "sync_commands",
  {
    id: text("id").primaryKey(),
    userId: text("user_id")
      .notNull()
      .references(() => users.id),
    commandType: text("command_type").notNull(),
    payload: text("payload").notNull(),
    status: text("status").notNull().default("applied"),
    result: text("result"),
    createdAt: createdAtColumn(),
  },
  (table) => [
    index("sync_commands_user_id_idx").on(table.userId),
    index("sync_commands_user_id_created_at_idx").on(table.userId, table.createdAt),
  ],
);

/** One entity-level change produced by an applied sync command, at a given revision. */
export const syncChanges = sqliteTable(
  "sync_changes",
  {
    id: idColumn(),
    userId: text("user_id")
      .notNull()
      .references(() => users.id),
    revision: integer("revision").notNull(),
    entityType: text("entity_type").notNull(),
    entityId: text("entity_id").notNull(),
    changeType: text("change_type").notNull(),
    payload: text("payload"),
    createdAt: createdAtColumn(),
  },
  (table) => [
    index("sync_changes_user_id_idx").on(table.userId),
    index("sync_changes_user_id_revision_idx").on(table.userId, table.revision),
  ],
);

/** Append-only audit trail (auth events, credential access, mutations). */
export const auditEvents = sqliteTable(
  "audit_events",
  {
    id: idColumn(),
    userId: text("user_id")
      .notNull()
      .references(() => users.id),
    eventType: text("event_type").notNull(),
    entityType: text("entity_type"),
    entityId: text("entity_id"),
    metadata: text("metadata"),
    createdAt: createdAtColumn(),
  },
  (table) => [
    index("audit_events_user_id_idx").on(table.userId),
    index("audit_events_user_id_created_at_idx").on(table.userId, table.createdAt),
  ],
);

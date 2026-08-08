/**
 * Shared column builders for the v2 relational schema (WP1).
 *
 * Conventions applied across every table:
 * - PKs are `TEXT` UUIDv7 strings, generated server-side (`uuidv7()` from
 *   `src/lib/server/uuidv7.ts`) — never client-supplied, never autoincrement.
 * - `legacyId` is present only on tables that have a corresponding id in the
 *   v1 JSON state (needed by WP9's migration parity checks); it is NOT part
 *   of this helper because it's optional per-table, added explicitly instead.
 * - Money is always an `INTEGER` minimal-unit column + a sibling `TEXT`
 *   `currency` (ISO 4217, or an internal pseudo-code for crypto) column,
 *   never `REAL` — per WP1's "never REAL" design decision.
 * - Timestamps are ISO-8601 strings (`TEXT`), matching the existing v1
 *   `app_state.updated_at` convention (see `src/lib/server/d1-state.ts`).
 */

import { text, integer } from "drizzle-orm/sqlite-core";
import { uuidv7 } from "../../lib/server/uuidv7";

/** Server-generated UUIDv7 primary key column. */
export function idColumn() {
  return text("id")
    .primaryKey()
    .$defaultFn(() => uuidv7());
}

/** ISO-8601 creation timestamp, defaulted at the application layer on insert. */
export function createdAtColumn() {
  return text("created_at").notNull();
}

/** ISO-8601 last-write timestamp, bumped on every update. */
export function updatedAtColumn() {
  return text("updated_at").notNull();
}

/**
 * Optimistic-concurrency counter, mirroring the pattern already used by
 * v1's `app_state.version` (see `src/lib/server/d1-state.ts`): bumped on
 * every write so a stale client write can be rejected as a 409 conflict.
 */
export function versionColumn() {
  return integer("version").notNull().default(1);
}

/** Integer minimal-unit money amount (e.g. cents). Never `REAL`. */
export function moneyMinorColumn(name: string) {
  return integer(name).notNull();
}

/** ISO 4217 currency code (or internal crypto pseudo-code) sibling column. */
export function currencyColumn() {
  return text("currency").notNull();
}

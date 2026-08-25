/**
 * Drizzle D1 client factory for the v2 database (WP1). Analogous to
 * `getD1FromLocals` in `src/lib/server/cloudflare-env.ts`, but returns a
 * Drizzle-wrapped instance bound to the `finance_tracker_db_v2` binding
 * instead of the raw v1 `D1DatabaseLike`.
 *
 * Per WP6's design decision, repositories are the *only* code allowed to
 * call this factory and touch D1 directly — API routes must go through a
 * repository, never call `getDb`/`drizzle` themselves.
 */

import { drizzle, type DrizzleD1Database } from "drizzle-orm/d1";
import * as schema from "./schema";
import { getRuntimeEnv } from "../lib/server/cloudflare-env";

export type Db = DrizzleD1Database<typeof schema>;

// Matches the codebase's existing convention (see `D1DatabaseLike` in
// `src/lib/server/d1-state.ts`) of a hand-rolled duck-typed binding instead
// of depending on `@cloudflare/workers-types`, which isn't installed here.
type D1BindingLike = Parameters<typeof drizzle>[0];

/** Wraps the `finance_tracker_db_v2` D1 binding in a typed Drizzle client. */
export function getDb(locals: App.Locals): Db {
  const binding = getRuntimeEnv(locals).finance_tracker_db_v2;
  if (!binding) {
    throw new Error("D1 binding 'finance_tracker_db_v2' no está disponible en runtime.");
  }
  return drizzle(binding as D1BindingLike, { schema });
}

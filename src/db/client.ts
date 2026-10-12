/**
 * Drizzle D1 client factory for the v2 relational database.
 *
 * Per WP6's design decision, repositories are the *only* code allowed to
 * call this factory and touch D1 directly — API routes must go through a
 * repository, never call `getDb`/`drizzle` themselves.
 */

import { drizzle, type DrizzleD1Database } from "drizzle-orm/d1";
import * as schema from "./schema";
import { getRuntimeEnv } from "../lib/server/cloudflare-env";

export type Db = DrizzleD1Database<typeof schema>;

// Keep Cloudflare's runtime binding behind the Drizzle boundary without
// importing generated Worker types into the SQLite test runtime.
type D1BindingLike = Parameters<typeof drizzle>[0];

/** Wraps the `finance_tracker_db_v2` D1 binding in a typed Drizzle client. */
export function getDb(locals: App.Locals): Db {
  const binding = getRuntimeEnv(locals).finance_tracker_db_v2;
  if (!binding) {
    throw new Error("D1 binding 'finance_tracker_db_v2' no está disponible en runtime.");
  }
  return drizzle(binding as D1BindingLike, { schema });
}

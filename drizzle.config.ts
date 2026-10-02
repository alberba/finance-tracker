import { defineConfig } from "drizzle-kit";

/**
 * Drizzle Kit config for the v2 relational schema (WP1). Generates SQL
 * migrations into `migrations-v2/`, a separate directory from the v1
 * `migrations/` used by the original `finance-tracker-db` — the two
 * databases are migrated independently (`d1:migrate:*` vs `d1:migrate:*:v2`
 * scripts in `package.json`).
 */
export default defineConfig({
  dialect: "sqlite",
  driver: "d1-http",
  schema: "./src/db/schema/index.ts",
  out: "./migrations-v2",
  verbose: true,
  strict: true,
});

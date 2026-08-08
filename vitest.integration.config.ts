import { defineConfig } from "vitest/config";

/**
 * WP5 — separate config for the real-D1 (better-sqlite3-backed) test tier.
 *
 * Kept apart from `vitest.config.ts` (which scopes `tests/unit/**` only,
 * per the `tests-tooling` map) because these tests spin up an actual
 * SQLite engine per test file and apply `migrations-v2/*.sql` — slower
 * and heavier than the pure unit tier, and not part of its coverage
 * thresholds.
 */
export default defineConfig({
  test: {
    include: ["tests/integration/**/*.test.ts"],
    environment: "node",
    globals: true,
    clearMocks: true,
    restoreMocks: true,
    // Real SQLite handles are not free — avoid oversubscribing workers.
    pool: "forks",
  },
});

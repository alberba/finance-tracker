/**
 * `isUniqueConstraintError` must see through Drizzle's wrapping
 * (FINANCE-TRACKER-6): D1 raises `D1_ERROR: UNIQUE constraint failed: ...`
 * but the caller receives `DrizzleQueryError: Failed query: ...` with the
 * D1 error as `cause`. Matching only the outer message lets a retried
 * command 500 instead of replaying its stored result.
 */

import { describe, expect, it } from "vitest";
import { isUniqueConstraintError } from "../../src/lib/server/sync/apply-command";

describe("isUniqueConstraintError", () => {
  it("matches a bare D1 unique violation", () => {
    expect(
      isUniqueConstraintError(
        new Error("D1_ERROR: UNIQUE constraint failed: sync_commands.id: SQLITE_CONSTRAINT"),
      ),
    ).toBe(true);
  });

  it("matches a Drizzle-wrapped D1 unique violation via the cause chain", () => {
    const d1Error = new Error(
      "D1_ERROR: UNIQUE constraint failed: sync_commands.id: SQLITE_CONSTRAINT (extended: SQLITE_CONSTRAINT_PRIMARYKEY)",
    );
    const wrapped = new Error(
      'Failed query: insert into "sync_commands" ("id", "user_id", "command_type", "payload", "status", "result", "created_at") values (?, ?, ?, ?, ?, ?, ?)',
      { cause: d1Error },
    );
    expect(isUniqueConstraintError(wrapped)).toBe(true);
  });

  it("rejects unrelated query failures", () => {
    const cause = new Error("D1_ERROR: no such table: stockevents_cash_sync_entries: SQLITE_ERROR");
    const wrapped = new Error('Failed query: select ... from "stockevents_cash_sync_entries"', {
      cause,
    });
    expect(isUniqueConstraintError(wrapped)).toBe(false);
    expect(isUniqueConstraintError(new Error("connection reset"))).toBe(false);
    expect(isUniqueConstraintError(null)).toBe(false);
  });
});

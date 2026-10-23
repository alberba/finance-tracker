import { describe, expect, it } from "vitest";
import { applyContributionSave } from "../../../src/domain/investment/contributions";
import { normalizeState } from "../../../src/scripts/state";

/**
 * WP6 fix for Contradiction #9 (`docs/archive/work-packages.md`):
 * `applyContributionSave` must not mutate its `draft` argument in place, so a
 * v2 repository can call it against a state assembled from D1 rows without
 * risking non-deterministic partial writes.
 */
describe("applyContributionSave purity", () => {
  it("does not mutate the draft argument on a successful save", () => {
    const draft = normalizeState({
      accounts: [{ id: "acc-1", name: "MyInvestor", openingBalance: 0 }],
      twrLiquidityAccountIds: ["acc-1"],
    });
    const before = JSON.parse(JSON.stringify(draft));

    const result = applyContributionSave(draft, {
      date: "2026-01-31",
      month: 0,
      snapshotInputs: [{ kind: "investments", id: "inv-1", value: "1000" }],
      allocations: [{ accountId: "acc-1", amount: 100 }],
      warnings: [],
    });

    expect(result.ok).toBe(true);
    expect(result.state).toBeDefined();
    expect(result.state).not.toBe(draft);
    // The original argument must be byte-for-byte unchanged.
    expect(draft).toEqual(before);
    // ...while the returned state actually carries the new contribution.
    expect(result.state?.contributions.length).toBeGreaterThan(draft.contributions.length);
  });

  it("does not mutate the draft argument on a failed save (no investment snapshot)", () => {
    const draft = normalizeState({
      snapshots: { "0": { month: 0, accounts: {}, investments: {}, liabilities: {} } },
    });
    const before = JSON.parse(JSON.stringify(draft));

    const result = applyContributionSave(draft, {
      date: "2026-01-31",
      month: 0,
      snapshotInputs: [],
      allocations: [],
      warnings: [],
    });

    expect(result.ok).toBe(false);
    expect(result.state).toBeUndefined();
    expect(draft).toEqual(before);
  });
});

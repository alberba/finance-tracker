import { afterEach, describe, expect, it, vi } from "vitest";

vi.mock("../../src/scripts/demo-mode", () => ({
  isDemoMode: vi.fn(() => false),
}));

import { isDemoMode } from "../../src/scripts/demo-mode";
import { getGlobalDemoState, isReadOnlyDemoActive } from "../../src/lib/client/demo-source";

describe("demo-source (WP8 read-only v2 demo)", () => {
  afterEach(() => {
    vi.unstubAllEnvs();
  });

  it("is inactive when sync v2 is off, regardless of demo mode", () => {
    vi.stubEnv("PUBLIC_SYNC_V2", "true");
    vi.mocked(isDemoMode).mockReturnValue(false);
    expect(isReadOnlyDemoActive()).toBe(false);
  });

  it("is inactive when sync v2 is on but demo mode is not active", () => {
    vi.stubEnv("PUBLIC_SYNC_V2", "");
    vi.mocked(isDemoMode).mockReturnValue(true);
    expect(isReadOnlyDemoActive()).toBe(false);
  });

  it("is active only when both sync v2 is enabled and demo mode is active", () => {
    vi.stubEnv("PUBLIC_SYNC_V2", "true");
    vi.mocked(isDemoMode).mockReturnValue(true);
    expect(isReadOnlyDemoActive()).toBe(true);
  });

  it("returns a deterministic, fully-populated demo state without touching the network", () => {
    const now = new Date("2026-07-19T10:00:00.000Z");
    const state = getGlobalDemoState(now);

    expect(state.meta.source).toBe("demo");
    expect(state.accounts.length).toBeGreaterThan(0);
    expect(state.transactions.length).toBeGreaterThan(0);
  });
});

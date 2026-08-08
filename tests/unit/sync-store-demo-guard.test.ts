import "fake-indexeddb/auto";
import { createPinia, setActivePinia } from "pinia";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

vi.mock("../../src/scripts/demo-mode", () => ({
  isDemoMode: vi.fn(() => false),
}));

import { isDemoMode } from "../../src/scripts/demo-mode";
import { useSyncStore } from "../../src/stores/sync";

describe("useSyncStore — read-only demo guard (WP8)", () => {
  beforeEach(() => {
    setActivePinia(createPinia());
  });

  afterEach(() => {
    vi.unstubAllEnvs();
  });

  it("rejects enqueueCommand while the v2 read-only demo is active", async () => {
    vi.stubEnv("PUBLIC_SYNC_V2", "true");
    vi.mocked(isDemoMode).mockReturnValue(true);

    const store = useSyncStore();
    await expect(
      store.enqueueCommand({ action: "noop" } as never),
    ).rejects.toThrow(/solo lectura/i);
  });

  it("does not throw for the demo guard when demo mode is inactive (falls through to the normal not-ready no-op)", async () => {
    vi.stubEnv("PUBLIC_SYNC_V2", "true");
    vi.mocked(isDemoMode).mockReturnValue(false);

    const store = useSyncStore();
    // Not initialized (`init()` never called) — resolves to null rather than
    // throwing, proving the demo guard isn't firing spuriously.
    await expect(store.enqueueCommand({ action: "noop" } as never)).resolves.toBeNull();
  });

  it("init() is a no-op while the v2 read-only demo is active (never opens per-user IndexedDB)", async () => {
    vi.stubEnv("PUBLIC_SYNC_V2", "true");
    vi.mocked(isDemoMode).mockReturnValue(true);

    const store = useSyncStore();
    await store.init("some-user-id");

    expect(store.userId).toBeNull();
  });
});

import { createPinia, setActivePinia } from "pinia";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

vi.mock("../../src/lib/client/state-initialize", () => ({
  initializeFreshState: vi.fn(),
}));

import { initializeFreshState } from "../../src/lib/client/state-initialize";
import { useDataStore } from "../../src/stores/data";

/**
 * Plain `node` environment (repo-wide vitest config, no jsdom dependency) —
 * `useToast()`/`window.location.reload` are stubbed manually just enough for
 * `showToast`'s `document.getElementById` early-return and the reload spy.
 */
function stubDom(): { reload: ReturnType<typeof vi.fn> } {
  vi.stubGlobal("document", { getElementById: () => null });
  const reload = vi.fn();
  vi.stubGlobal("window", { location: { reload } });
  return { reload };
}

describe("useDataStore — 'empezar de cero' (WP8)", () => {
  beforeEach(() => {
    setActivePinia(createPinia());
    vi.mocked(initializeFreshState).mockReset();
  });

  afterEach(() => {
    vi.unstubAllEnvs();
    vi.unstubAllGlobals();
  });

  it("canStartFresh is false when sync v2 is disabled (the default)", () => {
    vi.stubEnv("PUBLIC_SYNC_V2", "");
    const store = useDataStore();
    expect(store.canStartFresh).toBe(false);
  });

  it("canStartFresh is true when sync v2 is enabled", () => {
    vi.stubEnv("PUBLIC_SYNC_V2", "true");
    const store = useDataStore();
    expect(store.canStartFresh).toBe(true);
  });

  it("startFresh() is a no-op when sync v2 is disabled", async () => {
    vi.stubEnv("PUBLIC_SYNC_V2", "");
    const store = useDataStore();

    await store.startFresh();

    expect(initializeFreshState).not.toHaveBeenCalled();
  });

  it("startFresh() calls the API and reloads the page on success", async () => {
    vi.stubEnv("PUBLIC_SYNC_V2", "true");
    vi.mocked(initializeFreshState).mockResolvedValue({ ok: true, alreadyInitialized: false });
    const { reload } = stubDom();

    const store = useDataStore();
    await store.startFresh();

    expect(initializeFreshState).toHaveBeenCalledTimes(1);
    expect(reload).toHaveBeenCalledTimes(1);
  });

  it("startFresh() does not reload the page when the API call fails", async () => {
    vi.stubEnv("PUBLIC_SYNC_V2", "true");
    vi.mocked(initializeFreshState).mockResolvedValue({ ok: false, error: "boom" });
    const { reload } = stubDom();

    const store = useDataStore();
    await store.startFresh();

    expect(reload).not.toHaveBeenCalled();
  });
});

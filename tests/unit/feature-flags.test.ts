import { afterEach, describe, expect, it, vi } from "vitest";

import { isSyncV2Enabled } from "../../src/lib/client/feature-flags";

describe("feature-flags", () => {
  afterEach(() => {
    vi.unstubAllEnvs();
  });

  it("defaults to disabled when unset", () => {
    vi.stubEnv("PUBLIC_SYNC_V2", "");
    expect(isSyncV2Enabled()).toBe(false);
  });

  it("is disabled for any value other than 'true'/'1'", () => {
    vi.stubEnv("PUBLIC_SYNC_V2", "yes");
    expect(isSyncV2Enabled()).toBe(false);
  });

  it("is enabled for 'true'", () => {
    vi.stubEnv("PUBLIC_SYNC_V2", "true");
    expect(isSyncV2Enabled()).toBe(true);
  });

  it("is enabled for '1'", () => {
    vi.stubEnv("PUBLIC_SYNC_V2", "1");
    expect(isSyncV2Enabled()).toBe(true);
  });
});

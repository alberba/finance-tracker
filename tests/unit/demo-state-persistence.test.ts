import { beforeEach, describe, expect, it, vi } from "vitest";

vi.mock("../../src/scripts/demo-mode", () => ({
  isDemoMode: vi.fn(() => true),
  resolveRuntimeNamespace: vi.fn(() => "demo"),
}));

import {
  BASE_SEED,
  loadServerState,
  normalizeState,
  persistServerState,
} from "../../src/scripts/state";

describe("persistencia del modo demo", () => {
  beforeEach(() => {
    vi.stubGlobal("fetch", vi.fn());
  });

  it("usa el seed local sin leer el estado del servidor", async () => {
    await expect(loadServerState()).resolves.toBeNull();
    expect(fetch).not.toHaveBeenCalled();
  });

  it("confirma guardados locales sin escribir el estado en D1", async () => {
    const state = normalizeState(BASE_SEED);

    await expect(persistServerState(state)).resolves.toEqual({ status: "ok", version: 0 });
    expect(fetch).not.toHaveBeenCalled();
  });
});

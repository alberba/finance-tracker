import { afterEach, describe, expect, it, vi } from "vitest";

import { initializeFreshState } from "../../src/lib/client/state-initialize";

function mockFetchOnce(response: { status: number; body: unknown }): void {
  vi.stubGlobal(
    "fetch",
    vi.fn().mockResolvedValue({
      ok: response.status >= 200 && response.status < 300,
      status: response.status,
      json: () => Promise.resolve(response.body),
    }),
  );
}

describe("initializeFreshState (WP8 'empezar de cero')", () => {
  afterEach(() => {
    vi.unstubAllGlobals();
  });

  it("returns ok:true on a fresh 201", async () => {
    mockFetchOnce({ status: 201, body: { ok: true, alreadyInitialized: false } });

    const result = await initializeFreshState();

    expect(result).toEqual({ ok: true, alreadyInitialized: false });
    expect(fetch).toHaveBeenCalledWith(
      "/api/state/initialize",
      expect.objectContaining({ method: "POST" }),
    );
  });

  it("reports alreadyInitialized:true idempotently on a repeat call (200)", async () => {
    mockFetchOnce({ status: 200, body: { ok: true, alreadyInitialized: true } });

    const result = await initializeFreshState();

    expect(result).toEqual({ ok: true, alreadyInitialized: true });
  });

  it("sends the requested currency in the body when provided", async () => {
    mockFetchOnce({ status: 201, body: { ok: true } });

    await initializeFreshState("USD");

    expect(fetch).toHaveBeenCalledWith(
      "/api/state/initialize",
      expect.objectContaining({ body: JSON.stringify({ currency: "USD" }) }),
    );
  });

  it("surfaces a 401 as ok:false with the server error message", async () => {
    mockFetchOnce({ status: 401, body: { error: "Se requiere autenticación." } });

    const result = await initializeFreshState();

    expect(result).toEqual({ ok: false, error: "Se requiere autenticación." });
  });

  it("returns ok:false when fetch itself rejects (offline)", async () => {
    vi.stubGlobal("fetch", vi.fn().mockRejectedValue(new Error("network down")));

    const result = await initializeFreshState();

    expect(result).toEqual({ ok: false, error: "network down" });
  });
});

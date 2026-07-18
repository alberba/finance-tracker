import { describe, expect, it } from "vitest";
import { getFinanceNamespace } from "../../src/lib/server/state-request";

describe("getFinanceNamespace", () => {
  it("devuelve el namespace de la petición cuando existe", () => {
    const request = new Request("https://example.test", {
      headers: { "x-finance-namespace": "demo" },
    });

    expect(getFinanceNamespace(request)).toBe("demo");
  });

  it("devuelve undefined cuando la cabecera falta o está vacía", () => {
    expect(getFinanceNamespace(new Request("https://example.test"))).toBeUndefined();
    expect(
      getFinanceNamespace(
        new Request("https://example.test", {
          headers: { "x-finance-namespace": "" },
        }),
      ),
    ).toBeUndefined();
  });
});

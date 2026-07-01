import { describe, expect, it } from "vitest";
import {
  buildInvestmentDescription,
  computeInvestmentMovement,
  normalizeInvestmentSide,
  parseTransactionYear,
} from "../../src/scripts/investment-movements";

describe("investment-movements helpers", () => {
  it("calcula gasto dinámico de compra", () => {
    const computed = computeInvestmentMovement({
      side: "buy",
      symbol: "vwce",
      units: 3,
      unitPrice: 101.25,
      fee: 1.5,
    });

    expect(computed.signedAmount).toBe(305.25);
    expect(computed.description).toBe("Compra 3 VWCE");
    expect(computed.normalizedSymbol).toBe("VWCE");
  });

  it("calcula gasto dinámico de venta como negativo", () => {
    const computed = computeInvestmentMovement({
      side: "sell",
      symbol: "btc",
      units: 0.25,
      unitPrice: 20000,
      fee: 5,
    });

    expect(computed.signedAmount).toBe(-5005);
    expect(computed.description).toBe("Venta 0.25 BTC");
  });

  it("acepta títulos fraccionarios menores a 1", () => {
    const computed = computeInvestmentMovement({
      side: "buy",
      symbol: "eth",
      units: 0.5,
      unitPrice: 2500,
      fee: 1,
    });

    expect(computed.normalizedUnits).toBe(0.5);
    expect(computed.signedAmount).toBe(1251);
    expect(computed.description).toBe("Compra 0.5 ETH");
  });

  it("mantiene precisión en títulos pequeños", () => {
    const computed = computeInvestmentMovement({
      side: "buy",
      symbol: "ada",
      units: 0.00082023,
      unitPrice: 1000,
      fee: 0,
    });

    expect(computed.normalizedUnits).toBe(0.00082023);
    expect(computed.description).toBe("Compra 0.00082023 ADA");
    expect(computed.signedAmount).toBe(0.82);
  });

  it("normaliza side y extrae año desde ISO", () => {
    expect(normalizeInvestmentSide("sell")).toBe("sell");
    expect(normalizeInvestmentSide("otra-cosa")).toBe("buy");
    expect(parseTransactionYear("2026-03-04")).toBe(2026);
    expect(parseTransactionYear("04/03/2026")).toBeNull();
  });

  it("genera descripción para compra y venta", () => {
    expect(buildInvestmentDescription("buy", 2, "MSFT")).toBe("Compra 2 MSFT");
    expect(buildInvestmentDescription("sell", 1.5, "AAPL")).toBe(
      "Venta 1.5 AAPL",
    );
  });
});

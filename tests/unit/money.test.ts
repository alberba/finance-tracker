import { describe, expect, it } from "vitest";

import { fromMinorUnits, minorUnitExponent, toMinorUnits } from "../../src/lib/money";

describe("minorUnitExponent", () => {
  it("returns 2 for common currencies", () => {
    expect(minorUnitExponent("EUR")).toBe(2);
    expect(minorUnitExponent("USD")).toBe(2);
    expect(minorUnitExponent("GBP")).toBe(2);
  });

  it("returns 0 for JPY (no minor unit)", () => {
    expect(minorUnitExponent("JPY")).toBe(0);
  });

  it("returns 8 for BTC-style high-precision assets", () => {
    expect(minorUnitExponent("BTC")).toBe(8);
  });

  it("is case-insensitive and trims whitespace", () => {
    expect(minorUnitExponent(" eur ")).toBe(2);
  });

  it("defaults unknown currencies to 2", () => {
    expect(minorUnitExponent("XYZ")).toBe(2);
  });
});

describe("toMinorUnits / fromMinorUnits", () => {
  it("converts EUR amounts to cents", () => {
    expect(toMinorUnits(12.34, "EUR")).toBe(1234);
    expect(fromMinorUnits(1234, "EUR")).toBe(12.34);
  });

  it("converts USD amounts to cents", () => {
    expect(toMinorUnits(0.1, "USD")).toBe(10);
    expect(fromMinorUnits(10, "USD")).toBe(0.1);
  });

  it("converts JPY amounts with no minor unit", () => {
    expect(toMinorUnits(500, "JPY")).toBe(500);
    expect(fromMinorUnits(500, "JPY")).toBe(500);
  });

  it("converts BTC-style high-precision amounts (8 decimals)", () => {
    expect(toMinorUnits(0.00000001, "BTC")).toBe(1);
    expect(fromMinorUnits(1, "BTC")).toBe(0.00000001);
    expect(toMinorUnits(1.23456789, "BTC")).toBe(123456789);
  });

  it("rounds half-up at the boundary between minor units", () => {
    expect(toMinorUnits(12.345, "EUR")).toBe(1235);
    expect(toMinorUnits(12.344, "EUR")).toBe(1234);
  });

  it("avoids classic float rounding errors (0.1 + 0.2 style cases)", () => {
    expect(toMinorUnits(1.005, "EUR")).toBe(101);
    expect(toMinorUnits(19.99, "EUR")).toBe(1999);
  });

  it("handles negative amounts symmetrically", () => {
    expect(toMinorUnits(-12.34, "EUR")).toBe(-1234);
    expect(fromMinorUnits(-1234, "EUR")).toBe(-12.34);
  });

  it("handles string amounts", () => {
    expect(toMinorUnits("12.34", "EUR")).toBe(1234);
  });

  describe("round-trip property", () => {
    const currencies = ["EUR", "USD", "GBP", "JPY", "BTC"];
    const representativeMinorUnits = [0, 1, 42, 100, 1999, 123456, 987654321];

    for (const currency of currencies) {
      for (const minor of representativeMinorUnits) {
        it(`toMinorUnits(fromMinorUnits(${minor}, ${currency})) === ${minor}`, () => {
          const amount = fromMinorUnits(minor, currency);
          expect(toMinorUnits(amount, currency)).toBe(minor);
        });
      }
    }
  });
});

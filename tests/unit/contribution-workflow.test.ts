import { describe, expect, it } from "vitest";
import {
  deriveContributionFlow,
  findLiquidityTargets,
  getFlowFromAllocations,
  sanitizeFlowAllocations,
} from "../../src/scripts/contribution-workflow";
import { normalizeState } from "../../src/scripts/state";

describe("contribution-workflow helpers", () => {
  it("deriva flow desde allocations y redondea", () => {
    const allocations = sanitizeFlowAllocations([
      { accountId: "myinvestor", amount: 10.105 },
      { accountId: "trading-212", amount: "5,239" },
      { accountId: "", amount: 9 },
      { accountId: "trade-republic", amount: -1 },
    ]);

    expect(allocations).toEqual([
      { accountId: "myinvestor", amount: 10.11 },
      { accountId: "trading-212", amount: 5.24 },
    ]);
    expect(getFlowFromAllocations(allocations)).toBe(15.35);

    const derived = deriveContributionFlow({
      flow: 999,
      flowAllocations: allocations,
    });
    expect(derived.flowSource).toBe("allocations");
    expect(derived.flow).toBe(15.35);
  });

  it("mantiene fallback legacy cuando no hay allocations", () => {
    const derived = deriveContributionFlow({
      flow: 123.45,
      amount: 120,
      flowAllocations: [],
    });

    expect(derived.flowSource).toBe("legacy");
    expect(derived.flow).toBe(123.45);
  });

  it("encuentra cuentas objetivo con tolerancia de nombre", () => {
    const result = findLiquidityTargets([
      { id: "acc-1", name: "MyInvestor", openingBalance: 0 },
      { id: "acc-2", name: "Trading212", openingBalance: 0 },
      { id: "acc-3", name: "Trade Republic", openingBalance: 0 },
    ]);

    expect(result.missing).toEqual([]);
    expect(result.matched.map((account) => account.id)).toEqual(["acc-1", "acc-2", "acc-3"]);
  });

  it("normaliza contributions nuevos sin romper legacy", () => {
    const normalized = normalizeState({
      year: 2026,
      currency: "EUR",
      accounts: [{ id: "myinvestor", name: "MyInvestor", openingBalance: 0 }],
      investmentAssets: [{ id: "fondos-indexados", name: "Fondos Indexados", openingBalance: 0 }],
      liabilities: [],
      incomeCategories: ["Nomina"],
      expenseCategories: ["Comida"],
      investmentCategories: ["Fondos Indexados"],
      transactions: [],
      snapshots: {
        0: {
          month: 0,
          accounts: {},
          investments: { "fondos-indexados": 12000 },
          liabilities: {},
        },
      },
      budget: { income: {}, expense: {}, investment: {} },
      goals: {},
      contributions: [
        {
          id: "legacy",
          date: "2026-01-31",
          portfolioDate: "2026-01-31",
          portfolioValue: 12000,
          amount: 50,
          flow: 50,
        },
        {
          id: "alloc",
          date: "2026-02-28",
          portfolioDate: "2026-02-28",
          portfolioValue: 12500,
          amount: 0,
          flow: 0,
          flowAllocations: [{ accountId: "myinvestor", amount: 80 }],
          flowSource: "allocations",
        },
      ],
    });

    const legacy = normalized.contributions.find((item) => item.id === "legacy");
    const allocation = normalized.contributions.find((item) => item.id === "alloc");

    expect(legacy?.flowSource).toBe("legacy");
    expect(legacy?.flow).toBe(50);
    expect(allocation?.flowSource).toBe("allocations");
    expect(allocation?.flow).toBe(80);
    expect(allocation?.flowAllocations).toEqual([{ accountId: "myinvestor", amount: 80 }]);
  });
});

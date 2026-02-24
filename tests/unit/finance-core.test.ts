import { describe, expect, it } from "vitest";
import {
  computeAccountBalance,
  computeContributionMetrics,
  computeInvestmentValue,
  computeLiabilityValue,
  getCategoryActuals,
  getMonthTotals,
  getWealthByMonth,
  round2,
  slug,
  type Entity,
  type Snapshot,
  type Transaction,
} from "../../src/lib/finance-core";

const accounts: Entity[] = [
  { id: "revolut", name: "Revolut", openingBalance: 1000 },
  { id: "santander", name: "Santander", openingBalance: 500 },
];

const investments: Entity[] = [
  { id: "fondos-indexados", name: "Fondos Indexados", openingBalance: 2000 },
  { id: "crypto", name: "Crypto", openingBalance: 300 },
];

const liabilities: Entity[] = [{ id: "hipoteca", name: "Hipoteca", openingBalance: 90000 }];

const transactions: Transaction[] = [
  {
    id: "tx-1",
    date: "2026-01-05",
    month: 0,
    type: "income",
    accountId: "revolut",
    category: "Nómina",
    amount: 2000,
  },
  {
    id: "tx-2",
    date: "2026-01-06",
    month: 0,
    type: "expense",
    accountId: "revolut",
    category: "Comida",
    amount: 250,
  },
  {
    id: "tx-3",
    date: "2026-01-10",
    month: 0,
    type: "investment",
    accountId: "revolut",
    category: "Fondos Indexados",
    amount: 500,
  },
  {
    id: "tx-4",
    date: "2026-02-05",
    month: 1,
    type: "expense",
    accountId: "santander",
    category: "Comida",
    amount: 120,
  },
  {
    id: "tx-5",
    date: "2026-02-07",
    month: 1,
    type: "investment",
    accountId: "santander",
    category: "Crypto",
    amount: 80,
  },
];

const snapshots: Record<string, Snapshot> = {
  "1": {
    month: 1,
    accounts: { revolut: 1800 },
    investments: { "fondos-indexados": 2800 },
    liabilities: { hipoteca: 89000 },
  },
};

describe("finance-core helpers", () => {
  it("normaliza números y slugs", () => {
    expect(round2(12.3456)).toBe(12.35);
    expect(slug("  ETF Plata + Oro  ")).toBe("etf-plata-oro");
  });

  it("calcula totales mensuales por tipo", () => {
    const totals = getMonthTotals(transactions, 0);
    expect(totals).toEqual({ income: 2000, expense: 250, investment: 500 });
  });

  it("calcula reales por categoría", () => {
    const actuals = getCategoryActuals(transactions, "expense", 0, ["Comida", "Transporte"]);
    expect(actuals).toEqual({ Comida: 250, Transporte: 0 });
  });

  it("calcula saldo de cuenta considerando snapshot previo", () => {
    const revolutMonth0 = computeAccountBalance("revolut", 0, accounts, transactions, snapshots);
    expect(revolutMonth0).toBe(2250);

    const revolutMonth1 = computeAccountBalance("revolut", 1, accounts, transactions, snapshots);
    expect(revolutMonth1).toBe(1800);
  });

  it("calcula valor de inversión por categoría y snapshot", () => {
    const fundsMonth0 = computeInvestmentValue("fondos-indexados", 0, investments, transactions, snapshots);
    expect(fundsMonth0).toBe(2500);

    const fundsMonth1 = computeInvestmentValue("fondos-indexados", 1, investments, transactions, snapshots);
    expect(fundsMonth1).toBe(2800);

    const cryptoMonth1 = computeInvestmentValue("crypto", 1, investments, transactions, snapshots);
    expect(cryptoMonth1).toBe(380);
  });

  it("devuelve 0 para activos o pasivos inexistentes", () => {
    expect(computeInvestmentValue("asset-missing", 1, investments, transactions, snapshots)).toBe(0);
    expect(computeLiabilityValue("liability-missing", 1, liabilities, snapshots)).toBe(0);
  });

  it("calcula pasivos usando snapshot cuando existe", () => {
    const liabilityMonth0 = computeLiabilityValue("hipoteca", 0, liabilities, snapshots);
    expect(liabilityMonth0).toBe(90000);

    const liabilityMonth1 = computeLiabilityValue("hipoteca", 1, liabilities, snapshots);
    expect(liabilityMonth1).toBe(89000);
  });

  it("calcula patrimonio neto mensual", () => {
    const wealthMonth1 = getWealthByMonth(1, accounts, investments, liabilities, transactions, snapshots);

    expect(wealthMonth1).toEqual({
      liquidity: 2100,
      investment: 3180,
      liabilities: 89000,
      net: -83720,
    });
  });

  it("calcula métricas TWR con VLE base y participaciones según plantilla", () => {
    const metrics = computeContributionMetrics([
      {
        id: "c-1",
        date: "2026-01-01",
        portfolioDate: "2026-01-01",
        amount: 0,
        flow: 0,
        portfolioValue: 11088.94,
      },
      {
        id: "c-2",
        date: "2026-01-31",
        portfolioDate: "2026-01-31",
        amount: 580,
        flow: 580,
        portfolioValue: 11462.83,
      },
      {
        id: "c-3",
        date: "2026-02-08",
        portfolioDate: "2026-02-08",
        amount: 562,
        flow: 562,
        portfolioValue: 11800.15,
      },
    ]);

    expect(metrics).toHaveLength(3);
    expect(metrics[0].nav).toBe(100);
    expect(metrics[0].periodReturn).toBeNull();
    expect(metrics[0].cumulativeReturn).toBeNull();
    expect(metrics[1].nav).toBeCloseTo(103.371738, 6);
    expect(metrics[1].periodReturn).toBeCloseTo(0.03371738, 8);
    expect(metrics[1].cumulativeReturn).toBeCloseTo(0.03371738, 8);
    expect(metrics[1].unitsAfter).toBeCloseTo(116.5002179, 7);
    expect(metrics[2].nav).toBeCloseTo(101.2886517, 7);
    expect(metrics[2].periodReturn).toBeCloseTo(-0.02015126, 6);
    expect(metrics[2].cumulativeReturn).toBeCloseTo(0.012886517, 8);
    expect(metrics[2].unitsAfter).toBeCloseTo(122.0487171, 7);
  });

  it("soporta edge-cases en aportes sin romper cálculos", () => {
    expect(computeContributionMetrics([])).toEqual([]);

    const edgeMetrics = computeContributionMetrics([
      {
        id: "e1",
        date: "2026-01-01",
        portfolioDate: "2026-01-01",
        amount: 100,
        flow: 100,
        portfolioValue: 1000,
      },
      {
        id: "e2",
        date: "2026-02-01",
        portfolioDate: "2026-02-01",
        amount: 0,
        flow: 0,
        portfolioValue: 0,
      },
      {
        id: "e3",
        date: "2026-03-01",
        portfolioDate: "2026-03-01",
        amount: Number.POSITIVE_INFINITY,
        flow: Number.NaN,
        portfolioValue: 1100,
      },
    ]);

    expect(edgeMetrics).toHaveLength(3);
    expect(edgeMetrics[1].nav).toBe(100);
    expect(Number.isFinite(edgeMetrics[2].periodReturn || 0)).toBe(true);
  });
});

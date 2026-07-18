import type {
  Contribution,
  Entity,
  SnapshotRow,
  State,
  Subscription,
  Transaction,
} from "../scripts/types";

/**
 * Datos sintéticos para el modo demo. Se generan de forma determinista
 * (PRNG con semilla fija) y relativos a la fecha actual, para que la demo
 * siempre muestre un año en curso con movimientos verosímiles sin exponer
 * ningún dato real. Se importa tanto en el servidor (siembra del namespace
 * `demo` en D1) como en el cliente (seed base cuando el modo demo está activo).
 */

function mulberry32(seed: number): () => number {
  let a = seed;
  return () => {
    a |= 0;
    a = (a + 0x6d2b79f5) | 0;
    let t = Math.imul(a ^ (a >>> 15), 1 | a);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

function iso(year: number, month: number, day: number): string {
  return `${year}-${String(month + 1).padStart(2, "0")}-${String(day).padStart(2, "0")}`;
}

function round2(value: number): number {
  return Math.round(value * 100) / 100;
}

function addDays(date: Date, days: number): Date {
  const next = new Date(date);
  next.setDate(next.getDate() + days);
  return next;
}

function toISODate(date: Date): string {
  return iso(date.getFullYear(), date.getMonth(), date.getDate());
}

export function buildDemoSeed(now: Date = new Date()): State {
  const random = mulberry32(20260101);
  const year = now.getFullYear();
  const currentMonth = now.getMonth();
  const today = toISODate(now);
  const generatedAt = now.toISOString();

  const between = (min: number, max: number): number =>
    round2(min + random() * (max - min));

  const accounts: Entity[] = [
    { id: "cuenta-corriente", name: "Cuenta Corriente", openingBalance: 1850.75 },
    { id: "cuenta-ahorro", name: "Cuenta Ahorro", openingBalance: 9500 },
    { id: "efectivo", name: "Efectivo", openingBalance: 120 },
  ];
  const investmentAssets: Entity[] = [
    { id: "fondos-indexados", name: "Fondos Indexados", openingBalance: 14200 },
    { id: "criptomonedas", name: "Criptomonedas", openingBalance: 1650 },
  ];
  const liabilities: Entity[] = [
    { id: "prestamo-coche", name: "Préstamo Coche", openingBalance: 5400 },
  ];

  const transactions: Transaction[] = [];
  let txCounter = 0;
  const pushTx = (tx: Omit<Transaction, "id">): void => {
    txCounter += 1;
    if (tx.date > today) {
      return;
    }
    transactions.push({ id: `demo-tx-${String(txCounter).padStart(3, "0")}`, ...tx });
  };

  const groceryStores = ["Supermercado Norte", "Mercado Central", "Hiper Ahorro"];
  const leisureItems = ["Cena con amigos", "Cine", "Concierto", "Escapada fin de semana", "Libros"];

  for (let month = 0; month <= currentMonth; month += 1) {
    pushTx({
      date: iso(year, month, 1),
      month,
      type: "income",
      accountId: "cuenta-corriente",
      category: "Nómina",
      description: "Nómina mensual",
      amount: 2350,
    });
    pushTx({
      date: iso(year, month, 2),
      month,
      type: "expense",
      accountId: "cuenta-corriente",
      category: "Vivienda",
      description: "Alquiler",
      amount: 875,
    });
    pushTx({
      date: iso(year, month, 5),
      month,
      type: "expense",
      accountId: "cuenta-corriente",
      category: "Transporte",
      description: "Abono transporte",
      amount: 42.5,
    });
    pushTx({
      date: iso(year, month, 6),
      month,
      type: "expense",
      accountId: "cuenta-corriente",
      category: "Vivienda",
      description: "Cuota préstamo coche",
      amount: 185,
    });

    for (let i = 0; i < 4; i += 1) {
      pushTx({
        date: iso(year, month, 4 + i * 7),
        month,
        type: "expense",
        accountId: "cuenta-corriente",
        category: "Comida",
        description: groceryStores[Math.floor(random() * groceryStores.length)],
        amount: between(38, 96),
      });
    }

    for (let i = 0; i < 2; i += 1) {
      pushTx({
        date: iso(year, month, 9 + i * 9),
        month,
        type: "expense",
        accountId: "cuenta-corriente",
        category: "Ocio",
        description: leisureItems[Math.floor(random() * leisureItems.length)],
        amount: between(14, 62),
      });
    }

    if (month % 3 === 1) {
      pushTx({
        date: iso(year, month, 17),
        month,
        type: "expense",
        accountId: "cuenta-corriente",
        category: "Salud",
        description: "Farmacia",
        amount: between(12, 34),
      });
    }

    pushTx({
      date: iso(year, month, 3),
      month,
      type: "investment",
      accountId: "cuenta-corriente",
      category: "Fondos Indexados",
      description: "Aportación mensual fondo indexado",
      amount: 300,
      symbol: "SWDA",
      instrumentId: "fondo-msci-world",
      side: "buy",
      unitPrice: round2(92 + month * 0.8 + random() * 2),
      units: round2(300 / (92 + month * 0.8)),
      declared: true,
    });

    if (month % 2 === 0) {
      pushTx({
        date: iso(year, month, 15),
        month,
        type: "investment",
        accountId: "cuenta-corriente",
        category: "Criptomonedas",
        description: "Compra periódica BTC",
        amount: 50,
        symbol: "BTC",
        instrumentId: "btc",
        side: "buy",
        declared: true,
      });
    }
  }

  pushTx({
    date: iso(year, Math.min(4, currentMonth), 22),
    month: Math.min(4, currentMonth),
    type: "income",
    accountId: "cuenta-corriente",
    category: "Extra",
    description: "Venta segunda mano",
    amount: 140,
  });

  const snapshots: Record<string, SnapshotRow> = {};
  for (let month = 0; month < currentMonth; month += 1) {
    snapshots[String(month)] = {
      month,
      accounts: {
        "cuenta-corriente": round2(1850 + (month + 1) * 130 + between(-60, 60)),
        "cuenta-ahorro": round2(9500 + (month + 1) * 150),
        efectivo: round2(120 - month * 4),
      },
      investments: {
        "fondos-indexados": round2(14200 + (month + 1) * 340 + between(-120, 180)),
        criptomonedas: round2(1650 + between(-140, 190)),
      },
      liabilities: {
        "prestamo-coche": round2(Math.max(0, 5400 - (month + 1) * 185)),
      },
    };
  }

  const contributions: Contribution[] = [];
  for (let month = 0; month <= currentMonth; month += 1) {
    const date = iso(year, month, 3);
    if (date > today) {
      break;
    }
    contributions.push({
      id: `demo-contrib-${String(month + 1).padStart(2, "0")}`,
      date,
      amount: 300,
      portfolioDate: date,
      portfolioValue: round2(15850 + month * 345 + between(-110, 160)),
      flow: 300,
      flowAllocations: [{ accountId: "cuenta-corriente", amount: 300 }],
      flowSource: "allocations",
      warnings: [],
    });
  }

  const subscriptions: Subscription[] = [
    {
      id: "demo-sub-streaming",
      name: "Streaming Video",
      amount: 13.99,
      accountId: "cuenta-corriente",
      category: "Suscripciones",
      frequency: "monthly",
      startDate: iso(year, 0, 8),
      nextChargeDate: toISODate(addDays(now, 8)),
      active: true,
    },
    {
      id: "demo-sub-musica",
      name: "Streaming Música",
      amount: 11.99,
      accountId: "cuenta-corriente",
      category: "Suscripciones",
      frequency: "monthly",
      startDate: iso(year, 0, 15),
      nextChargeDate: toISODate(addDays(now, 15)),
      active: true,
    },
    {
      id: "demo-sub-gimnasio",
      name: "Gimnasio",
      amount: 34.9,
      accountId: "cuenta-corriente",
      category: "Suscripciones",
      frequency: "monthly",
      startDate: iso(year, 0, 20),
      nextChargeDate: toISODate(addDays(now, 20)),
      active: true,
    },
  ];

  const budgetMonths = (value: number): number[] =>
    Array.from({ length: 12 }, () => value);

  const nextMonthFirst =
    currentMonth === 11 ? iso(year + 1, 0, 1) : iso(year, currentMonth + 1, 1);
  // El día 1 del mes la "última ejecución" del alquiler (día 2) aún no ocurrió.
  const rentExecuted = now.getDate() >= 2;
  const rentLastExecution = rentExecuted
    ? iso(year, currentMonth, 2)
    : currentMonth === 0
      ? iso(year - 1, 11, 2)
      : iso(year, currentMonth - 1, 2);
  const rentNextOccurrence = rentExecuted
    ? currentMonth === 11
      ? iso(year + 1, 0, 2)
      : iso(year, currentMonth + 1, 2)
    : iso(year, currentMonth, 2);

  return {
    meta: {
      source: "demo",
      generatedAt,
      version: 1,
      savedAt: null,
    },
    year,
    currency: "EUR",
    twrLiquidityAccountIds: ["cuenta-corriente", "cuenta-ahorro"],
    accounts,
    investmentAssets,
    liabilities,
    incomeCategories: ["Nómina", "Extra", "Intereses"],
    expenseCategories: [
      "Vivienda",
      "Comida",
      "Transporte",
      "Ocio",
      "Suscripciones",
      "Salud",
      "Otros",
    ],
    investmentCategories: ["Fondos Indexados", "Criptomonedas"],
    categoryEmojis: {},
    transactions,
    subscriptions,
    snapshots,
    budget: {
      income: { "Nómina": budgetMonths(2350), Extra: budgetMonths(50), Intereses: budgetMonths(10) },
      expense: {
        Vivienda: budgetMonths(1060),
        Comida: budgetMonths(320),
        Transporte: budgetMonths(60),
        Ocio: budgetMonths(120),
        Suscripciones: budgetMonths(65),
        Salud: budgetMonths(30),
        Otros: budgetMonths(50),
      },
      investment: {
        "Fondos Indexados": budgetMonths(300),
        Criptomonedas: budgetMonths(25),
      },
    },
    goals: {
      short: { name: "Fondo de emergencia", targetYear: year, targetAmount: 12000 },
      medium: { name: "Entrada piso", targetYear: year + 3, targetAmount: 40000 },
      long: { name: "Libertad financiera", targetYear: year + 10, targetAmount: 150000 },
      investmentTotal: { name: "Cartera total", targetYear: year + 2, targetAmount: 25000 },
      investmentFunds: { name: "Fondos indexados", targetYear: year + 2, targetAmount: 20000 },
      investmentCrypto: { name: "Criptomonedas", targetYear: year + 2, targetAmount: 4000 },
    },
    contributions,
    instruments: [
      {
        id: "fondo-msci-world",
        investmentAssetId: "fondos-indexados",
        type: "fund",
        symbol: "SWDA",
        market: "XLON",
        currency: "EUR",
        provider: "twelve-data",
        active: true,
        openingUnits: 152.4,
      },
      {
        id: "btc",
        investmentAssetId: "criptomonedas",
        type: "crypto",
        symbol: "BTC",
        market: "",
        currency: "EUR",
        provider: "coingecko",
        active: true,
        openingUnits: 0.026,
      },
    ],
    quotes: {
      "fondo-msci-world": {
        instrumentId: "fondo-msci-world",
        price: round2(92 + currentMonth * 0.8),
        currency: "EUR",
        timestamp: generatedAt,
        source: "demo",
        status: "stale",
        isStale: true,
        previousClose: round2(91.4 + currentMonth * 0.8),
        changePercent: 0.42,
      },
      btc: {
        instrumentId: "btc",
        price: 61250,
        currency: "EUR",
        timestamp: generatedAt,
        source: "demo",
        status: "stale",
        isStale: true,
        previousClose: 60480,
        changePercent: 1.27,
      },
    },
    recurringRules: [
      {
        id: "demo-rule-nomina",
        type: "income",
        accountId: "cuenta-corriente",
        category: "Nómina",
        description: "Nómina mensual",
        amount: 2350,
        frequency: "monthly",
        interval: 1,
        startDate: iso(year, 0, 1),
        endDate: null,
        active: true,
        lastExecutionDate: iso(year, currentMonth, 1),
        nextOccurrenceDate: nextMonthFirst,
      },
      {
        id: "demo-rule-alquiler",
        type: "expense",
        accountId: "cuenta-corriente",
        category: "Vivienda",
        description: "Alquiler",
        amount: 875,
        frequency: "monthly",
        interval: 1,
        startDate: iso(year, 0, 2),
        endDate: null,
        active: true,
        lastExecutionDate: rentLastExecution,
        nextOccurrenceDate: rentNextOccurrence,
      },
    ],
    pendingMovements: [],
    stockEvents: {
      enabled: false,
      apiKey: "",
      symbolMappings: [],
    },
  };
}

export const FINANCE_TRACKER_DEMO_SEED: State = buildDemoSeed();

export default FINANCE_TRACKER_DEMO_SEED;

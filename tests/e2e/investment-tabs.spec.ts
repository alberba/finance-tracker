import { test, expect } from "./fixtures";

test.describe("inversión tabs y TWR", () => {
  test("inversión muestra 3 subpestañas y alterna vistas", async ({ tracker }) => {
    await tracker.openInvestment();
    const investmentSection = tracker.investmentSection();

    await expect(investmentSection.getByRole("tab", { name: "Dashboard" })).toBeVisible();
    await expect(investmentSection.getByRole("tab", { name: "Movimientos" })).toBeVisible();
    await expect(investmentSection.getByRole("tab", { name: "Aportes" })).toBeVisible();

    await tracker.openInvestmentDashboardTab();
    await expect(investmentSection.locator("#investment-tab-dashboard")).toBeVisible();
    await expect(investmentSection.locator("#investment-tab-movements")).toBeHidden();

    await tracker.openInvestmentMovementsTab();
    await expect(investmentSection.locator("#investment-tab-movements")).toBeVisible();

    await tracker.openInvestmentContributionsTab();
    await expect(investmentSection.locator("#investment-tab-contributions")).toBeVisible();
  });

  test("movimientos de inversión solo muestra tipo inversión", async ({ tracker }) => {
    await tracker.openInvestmentMovementsTab();
    const operations = await tracker.getInvestmentMovementsOperations();
    expect(operations.length).toBeGreaterThan(0);
    expect(operations.every((value) => value === "Compra" || value === "Venta")).toBe(true);
  });

  test("editar y eliminar en movimientos de inversión se refleja en movimientos generales", async ({ tracker }) => {
    await tracker.addInvestmentMovement({
      date: "2026-02-22",
      time: "10:30",
      side: "buy",
      symbol: "E2ESYNC",
      unitPrice: 25,
      units: 3,
      fee: 2,
      movementCurrency: "EUR",
      brokerName: "Revolut",
    });

    await tracker.editInvestmentMovementBySymbol("E2ESYNC", {
      unitPrice: 30,
      units: 2,
      fee: 1,
      newSymbol: "E2EEDIT",
      declared: true,
    });

    await tracker.openTransactions();
    await tracker.filterTransactionsMonth("FEBRERO");
    await tracker.setTransactionDescriptionFilter("Compra 2 E2EEDIT");
    await tracker.expectTransactionDescriptionVisible("Compra 2 E2EEDIT");

    await tracker.deleteInvestmentMovementBySymbol("E2EEDIT");
    await tracker.openTransactions();
    await tracker.filterTransactionsMonth("FEBRERO");
    await tracker.setTransactionDescriptionFilter("Compra 2 E2EEDIT");
    await expect(tracker.transactionsSection.locator("#tx-table-body tr", { hasText: "Compra 2 E2EEDIT" })).toHaveCount(0);
  });

  test("filtros de año y no declarados en inversión", async ({ tracker }) => {
    await tracker.addInvestmentMovement({
      date: "2025-12-10",
      time: "12:00",
      side: "buy",
      symbol: "YEAR2025",
      unitPrice: 10,
      units: 5,
      fee: 0,
      declared: false,
    });
    await tracker.addInvestmentMovement({
      date: "2026-01-10",
      time: "12:00",
      side: "buy",
      symbol: "YEAR2026D",
      unitPrice: 10,
      units: 5,
      fee: 0,
      declared: true,
    });

    await tracker.openInvestmentMovementsTab();
    await tracker.filterInvestmentYear(2025);
    await expect(tracker.investmentSection().locator("#investment-tx-table-body tr", { hasText: "YEAR2025" })).toHaveCount(1);
    await expect(tracker.investmentSection().locator("#investment-tx-table-body tr", { hasText: "YEAR2026D" })).toHaveCount(0);

    await tracker.filterInvestmentYear(2026);
    await tracker.setInvestmentOnlyUndeclared(true);
    await expect(tracker.investmentSection().locator("#investment-tx-table-body tr", { hasText: "YEAR2026D" })).toHaveCount(0);
  });

  test("categoría de inversión: Bitvavo fija Crypto y otros brokers permiten elegir del desplegable", async ({ tracker }) => {
    await tracker.openInvestmentMovementsTab();

    const section = tracker.investmentSection();
    await section.locator("#investment-movement-broker").selectOption({ label: "Bitvavo" });
    await expect(section.locator("#investment-movement-category")).toBeDisabled();
    await expect(section.locator("#investment-movement-category")).toHaveValue("Crypto");

    await section.locator("#investment-movement-broker").selectOption({ label: "Revolut" });
    await expect(section.locator("#investment-movement-category")).toBeEnabled();

    await tracker.addInvestmentMovement({
      date: "2026-03-10",
      time: "09:30",
      side: "buy",
      symbol: "BTC",
      category: "NoDeberiaQuedar",
      unitPrice: 10,
      units: 1,
      fee: 0,
      brokerName: "Bitvavo",
    });

    await tracker.addInvestmentMovement({
      date: "2026-03-11",
      time: "10:00",
      side: "buy",
      symbol: "VWCE",
      category: "Fondos Indexados",
      unitPrice: 10,
      units: 1,
      fee: 0,
      brokerName: "Revolut",
    });

    await tracker.openTransactions();
    await tracker.filterTransactionsMonth("MARZO");
    await expect(
      tracker.transactionsSection.locator("#tx-table-body tr", {
        hasText: "Compra 1 BTC",
      })
    ).toContainText("Crypto");
    await expect(
      tracker.transactionsSection.locator("#tx-table-body tr", {
        hasText: "Compra 1 VWCE",
      })
    ).toContainText("Fondos Indexados");
  });

  test("aportes renderiza tabla TWR con base 100 y retornos iniciales vacíos", async ({ tracker }) => {
    await tracker.openInvestmentContributionsTab();
    const section = tracker.investmentSection();

    const headers = await section.locator("#investment-tab-contributions thead th").allInnerTexts();
    expect(headers.map((value) => value.trim())).toEqual([
      "Fecha",
      "Valor cartera (cierre)",
      "Flujo del día",
      "VLE",
      "Participaciones antes",
      "Participaciones después",
      "Retorno período",
      "Retorno acumulado",
    ]);

    const firstRow = section.locator("#contribution-body tr").first();
    await expect(firstRow).toBeVisible();
    await expect(firstRow.locator("td").nth(3)).toHaveText("100");
    await expect(firstRow.locator("td").nth(6)).toHaveText("--");
    await expect(firstRow.locator("td").nth(7)).toHaveText("--");
  });

  test("editar flujo en aportes recalcula y persiste tras recarga", async ({ tracker }) => {
    await tracker.openInvestmentContributionsTab();
    const section = tracker.investmentSection();

    const firstRow = section.locator("#contribution-body tr").first();
    const firstDate = (await firstRow.locator("td").nth(0).innerText()).trim();

    const secondRow = section.locator("#contribution-body tr").nth(1);
    await expect(secondRow).toBeVisible();
    const previousVle = (await secondRow.locator("td").nth(3).innerText()).trim();

    await tracker.setContributionFlowByDate(firstDate, 0);

    const nextVle = (await secondRow.locator("td").nth(3).innerText()).trim();
    expect(nextVle).not.toBe(previousVle);

    await tracker.reload();
    await tracker.openInvestmentContributionsTab();
    const persistedVle = (await tracker.investmentSection().locator("#contribution-body tr").nth(1).locator("td").nth(3).innerText()).trim();
    expect(persistedVle).toBe(nextVle);
  });
});

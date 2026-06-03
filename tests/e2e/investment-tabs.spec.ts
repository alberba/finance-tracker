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
      category: "Fondos Indexados",
      declared: true,
    });

    await tracker.expectInvestmentMovementCategory("E2EEDIT", "Fondos Indexados");

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

  test("el símbolo en movimientos de inversión conserva espacios mientras se escribe", async ({ tracker }) => {
    await tracker.openInvestmentMovementsTab();

    const symbolInput = tracker.investmentSection().locator("#investment-movement-symbol");
    await symbolInput.click();
    await symbolInput.pressSequentially("MSCI WORLD");
    await expect(symbolInput).toHaveValue("MSCI WORLD");

    await tracker.addInvestmentMovement({
      date: "2026-03-12",
      time: "11:15",
      side: "buy",
      symbol: "MSCI WORLD",
      unitPrice: 10,
      units: 1,
      fee: 0,
      brokerName: "Revolut",
    });

    await expect(
      tracker.investmentSection().locator("#investment-tx-table-body tr", {
        hasText: "MSCI WORLD",
      })
    ).toHaveCount(1);
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
      "Acciones",
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

    const editableRow = section.locator("#contribution-body tr", { hasText: "2026-01-31" });
    await expect(editableRow).toBeVisible();
    const editableDate = (await editableRow.locator("td").nth(0).innerText()).trim();

    const downstreamRow = section.locator("#contribution-body tr", { hasText: "2026-02-08" });
    await expect(downstreamRow).toBeVisible();
    const previousVle = (await downstreamRow.locator("td").nth(3).innerText()).trim();

    await tracker.setContributionFlowByDate(editableDate, 0);

    const nextVle = (await downstreamRow.locator("td").nth(3).innerText()).trim();
    expect(nextVle).not.toBe(previousVle);

    await tracker.reload();
    await tracker.openInvestmentContributionsTab();
    const persistedVle = (
      await tracker
        .investmentSection()
        .locator("#contribution-body tr", { hasText: "2026-02-08" })
        .locator("td")
        .nth(3)
        .innerText()
    ).trim();
    expect(persistedVle).toBe(nextVle);
  });

  test("aportes muestra también fechas manuales fuera de cierre mensual", async ({ tracker }) => {
    await tracker.openInvestmentContributionsTab();
    const section = tracker.investmentSection();

    const manualRow = section.locator("#contribution-body tr", { hasText: "2026-02-08" });
    await expect(manualRow).toBeVisible();
    await expect(manualRow.locator('input[data-contribution-flow-date="2026-02-08"]')).toHaveValue("562");
  });

  test("aportes automáticos de cierre mensual incluyen la liquidez del mes en valor cartera", async ({ tracker }) => {
    await tracker.openInvestmentContributionsTab();
    const section = tracker.investmentSection();

    const monthEndRow = section.locator("#contribution-body tr", { hasText: "2026-01-31" });
    await expect(monthEndRow).toBeVisible();
    await expect(monthEndRow.locator("td").nth(1)).toHaveText("11.556,39 €");
    await expect(monthEndRow.locator('button[data-delete-contribution-date="2026-01-31"]')).toHaveCount(0);
  });

  test("aportes manuales se pueden eliminar desde la tabla", async ({ tracker, page }) => {
    await tracker.deleteManualContributionByDate("2026-02-08");
    await expect(page.locator("#contribution-delete-dialog")).toContainText("2026-02-08");
    await tracker.confirmDeleteManualContribution();
    await expect(page.getByRole("status")).toContainText("Aporte manual eliminado.");
    await expect(tracker.investmentSection().locator("#contribution-body tr", { hasText: "2026-02-08" })).toHaveCount(0);
  });
});

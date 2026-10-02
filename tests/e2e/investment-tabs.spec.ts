import { test, expect, mirrorStateToServer } from "./fixtures";

test.describe("inversión tabs y TWR", () => {
  test("inversión muestra 3 subpestañas y alterna vistas", async ({
    tracker,
  }) => {
    await tracker.openInvestment();
    const investmentSection = tracker.investmentSection();

    await expect(
      investmentSection.getByRole("tab", { name: "Resumen" }),
    ).toBeVisible();
    await expect(
      investmentSection.getByRole("tab", { name: "Movimientos" }),
    ).toBeVisible();
    await expect(
      investmentSection.getByRole("tab", { name: "Aportes" }),
    ).toBeVisible();

    await tracker.openInvestmentDashboardTab();
    await expect(
      investmentSection.locator("#investment-tab-dashboard"),
    ).toBeVisible();
    await expect(
      investmentSection.locator("#investment-tab-movements"),
    ).toBeHidden();

    await tracker.openInvestmentMovementsTab();
    await expect(
      investmentSection.locator("#investment-tab-movements"),
    ).toBeVisible();

    await tracker.openInvestmentContributionsTab();
    await expect(
      investmentSection.locator("#investment-tab-contributions"),
    ).toBeVisible();
  });

  test("movimientos de inversión solo muestra tipo inversión", async ({
    tracker,
  }) => {
    await tracker.openInvestmentMovementsTab();
    const operations = await tracker.getInvestmentMovementsOperations();
    expect(operations.length).toBeGreaterThan(0);
    expect(
      operations.every((value) => value === "Compra" || value === "Venta"),
    ).toBe(true);
  });

  test("permite descontar una compra del efectivo de Stock Events", async ({
    tracker,
    page,
  }) => {
    await tracker.openInvestmentMovementsTab();
    await expect(
      tracker.investmentSection().locator("#investment-movement-to-cash"),
    ).toHaveCount(0);

    let syncedTransaction: Record<string, unknown> | undefined;
    await page.route("**/api/integrations/stockevents", (route) =>
      route.fulfill({ status: 200, contentType: "application/json", body: '{"configured":true}' }),
    );
    await page.route("**/api/stockevents/transactions", async (route) => {
      const body = route.request().postDataJSON() as {
        transaction?: Record<string, unknown>;
      };
      syncedTransaction = body.transaction;
      await new Promise((resolve) => setTimeout(resolve, 250));
      await route.fulfill({
        status: 201,
        contentType: "application/json",
        body: JSON.stringify({
          transaction: {
            id: "se-cash-1",
            watchlistId: "wl-etf",
            symbol: "CASHBUY",
          },
        }),
      });
    });

    await page.evaluate(() => {
      const raw = localStorage.getItem("finance-tracker-state-v1");
      if (!raw) {
        throw new Error("No se encontró el estado financiero inicial");
      }
      const state = JSON.parse(raw);
      state.stockEvents = {
        enabled: true,
        apiKey: "",
        symbolMappings: [
          {
            symbol: "CASHBUY",
            sync: true,
            watchlistId: "wl-etf",
            targetSymbol: "",
            hidden: false,
          },
        ],
      };
      localStorage.setItem("finance-tracker-state-v1", JSON.stringify(state));
    });
    await mirrorStateToServer(page);
    await page.reload();
    await tracker.openInvestmentMovementsTab();
    await tracker
      .investmentSection()
      .locator("#investment-movement-symbol")
      .fill("CASHBUY");

    await expect(
      tracker.investmentSection().getByRole("checkbox", {
        name: "Descontar del efectivo en Stock Events",
      }),
    ).toBeVisible();

    await tracker.addInvestmentMovement({
      date: "2026-07-19",
      time: "10:04",
      side: "buy",
      symbol: "CASHBUY",
      category: "Fondos Indexados",
      unitPrice: 50,
      units: 2,
      fee: 1,
      brokerName: "Revolut",
      stockEventsCash: true,
    });

    await expect.poll(() => syncedTransaction).toMatchObject({
      watchlistId: "wl-etf",
      symbol: "CASHBUY",
      change: 2,
      price: 50,
      feesAmount: 1,
      toCash: true,
      type: "buy",
    });
  });

  test("no ofrece ajustar efectivo para símbolos sin mapeo activo", async ({
    tracker,
    page,
  }) => {
    await page.evaluate(() => {
      const raw = localStorage.getItem("finance-tracker-state-v1");
      if (!raw) throw new Error("No se encontró el estado financiero inicial");
      const state = JSON.parse(raw);
      state.stockEvents = {
        enabled: true,
        apiKey: "test-stock-events-key",
        symbolMappings: [],
      };
      localStorage.setItem("finance-tracker-state-v1", JSON.stringify(state));
    });
    await mirrorStateToServer(page);
    await page.reload();
    await tracker.openInvestmentMovementsTab();

    await tracker
      .investmentSection()
      .locator("#investment-movement-symbol")
      .fill("UNMAPPED");

    await expect(
      tracker.investmentSection().locator("#investment-movement-to-cash"),
    ).toHaveCount(0);
  });

  test("avisa y permite reenviar un movimiento salteado por Stock Events", async ({
    tracker,
    page,
  }) => {
    await page.route("**/api/integrations/stockevents", (route) =>
      route.fulfill({ status: 200, contentType: "application/json", body: '{"configured":true}' }),
    );
    let syncedTransaction: Record<string, unknown> | undefined;
    await page.route("**/api/stockevents/transactions", async (route) => {
      const body = route.request().postDataJSON() as {
        transaction?: Record<string, unknown>;
      };
      syncedTransaction = body.transaction;
      await route.fulfill({
        status: 201,
        contentType: "application/json",
        body: JSON.stringify({
          transaction: {
            id: "se-resend-1",
            watchlistId: "wl-etf",
            symbol: "RESEND",
          },
        }),
      });
    });

    // Warmup: compile the lazy investment chunk before the reload flow.
    await tracker.openInvestmentMovementsTab();

    await page.evaluate(() => {
      const raw = localStorage.getItem("finance-tracker-state-v1");
      if (!raw) throw new Error("No se encontró el estado financiero inicial");
      const state = JSON.parse(raw);
      state.stockEvents = { enabled: true, apiKey: "", symbolMappings: [] };
      localStorage.setItem("finance-tracker-state-v1", JSON.stringify(state));
    });
    await mirrorStateToServer(page);
    await page.reload();
    await expect(page.locator('html[data-finance-ready="true"]')).toBeVisible({ timeout: 15000 });
    await tracker.openInvestmentMovementsTab();

    // Sin mapeo el envío automático se salta con aviso visible y sin botón.
    const section = tracker.investmentSection();
    await section.locator("#investment-movement-date").fill("2026-09-04");
    await section.locator("#investment-movement-time").fill("16:11");
    await section.locator("#investment-movement-side").selectOption("buy");
    await section.locator("#investment-movement-symbol").fill("RESEND");
    await section.locator("#investment-movement-unit-price").fill("2110.3");
    await section.locator("#investment-movement-units").fill("0.0047");
    await section.locator("#investment-movement-fee").fill("0.03");
    await section
      .locator("#investment-movement-broker")
      .selectOption({ label: "Revolut" });
    await section.getByRole("button", { name: "Guardar movimiento" }).click();
    await expect(page.getByRole("status")).toContainText(
      "no tiene sincronización activada",
    );
    await expect(
      section.getByRole("button", { name: /Reenviar movimiento/ }),
    ).toHaveCount(0);

    // El mapeo llega después: aparece el botón y el reenvío crea la transacción.
    await page.evaluate(() => {
      const raw = localStorage.getItem("finance-tracker-state-v1");
      if (!raw) throw new Error("No se encontró el estado financiero inicial");
      const state = JSON.parse(raw);
      state.stockEvents.symbolMappings = [
        { symbol: "RESEND", sync: true, watchlistId: "wl-etf", targetSymbol: "", hidden: false },
      ];
      localStorage.setItem("finance-tracker-state-v1", JSON.stringify(state));
    });
    await mirrorStateToServer(page);
    await page.reload();
    await expect(page.locator('html[data-finance-ready="true"]')).toBeVisible({ timeout: 15000 });
    await tracker.openInvestmentMovementsTab();
    const resend = tracker
      .investmentSection()
      .getByRole("button", { name: "Reenviar movimiento del 2026-09-04 a Stock Events" });
    await expect(resend).toBeVisible();
    await resend.click();
    await expect.poll(() => syncedTransaction).toMatchObject({
      watchlistId: "wl-etf",
      symbol: "RESEND",
      type: "buy",
    });
    expect(Number(syncedTransaction?.change)).toBeCloseTo(0.0047, 8);
    expect(Number(syncedTransaction?.price)).toBeCloseTo(2110.3, 6);
  });

  test("editar y eliminar en movimientos de inversión se refleja en movimientos generales", async ({
    tracker,
  }) => {
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

    await tracker.expectInvestmentMovementCategory(
      "E2EEDIT",
      "Fondos Indexados",
    );

    await tracker.openTransactions();
    await tracker.filterTransactionsMonth("FEBRERO");
    await tracker.setTransactionDescriptionFilter("Compra 2 E2EEDIT");
    await tracker.expectTransactionDescriptionVisible("Compra 2 E2EEDIT");

    await tracker.deleteInvestmentMovementBySymbol("E2EEDIT");
    await tracker.openTransactions();
    await tracker.filterTransactionsMonth("FEBRERO");
    await tracker.setTransactionDescriptionFilter("Compra 2 E2EEDIT");
    await expect(
      tracker.transactionRows.filter({ hasText: "Compra 2 E2EEDIT" }),
    ).toHaveCount(0);
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
    await expect(
      tracker
        .investmentSection()
        .locator("#investment-tx-table-body tr", { hasText: "YEAR2025" }),
    ).toHaveCount(1);
    await expect(
      tracker
        .investmentSection()
        .locator("#investment-tx-table-body tr", { hasText: "YEAR2026D" }),
    ).toHaveCount(0);

    await tracker.filterInvestmentYear(2026);
    await tracker.setInvestmentOnlyUndeclared(true);
    await expect(
      tracker
        .investmentSection()
        .locator("#investment-tx-table-body tr", { hasText: "YEAR2026D" }),
    ).toHaveCount(0);
  });

  test("categoría de inversión: Bitvavo fija Crypto y otros brokers permiten elegir del desplegable", async ({
    tracker,
  }) => {
    await tracker.openInvestmentMovementsTab();

    const section = tracker.investmentSection();
    await section
      .locator("#investment-movement-broker")
      .selectOption({ label: "Bitvavo" });
    await expect(
      section.locator("#investment-movement-category"),
    ).toBeDisabled();
    await expect(section.locator("#investment-movement-category")).toHaveValue(
      "Crypto",
    );

    await section
      .locator("#investment-movement-broker")
      .selectOption({ label: "Revolut" });
    await expect(
      section.locator("#investment-movement-category"),
    ).toBeEnabled();

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
      tracker.transactionRows.filter({ hasText: "Compra 1 BTC" }),
    ).toContainText("Crypto");
    await expect(
      tracker.transactionRows.filter({ hasText: "Compra 1 VWCE" }),
    ).toContainText("Fondos Indexados");
  });

  test("el símbolo en movimientos de inversión conserva espacios mientras se escribe", async ({
    tracker,
  }) => {
    await tracker.openInvestmentMovementsTab();

    const symbolInput = tracker
      .investmentSection()
      .locator("#investment-movement-symbol");
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
      }),
    ).toHaveCount(1);
  });

  test("aportes renderiza tabla TWR con base 100 y retornos iniciales vacíos", async ({
    tracker,
  }) => {
    await tracker.openInvestmentContributionsTab();
    const section = tracker.investmentSection();

    const headers = await section
      .locator("#investment-tab-contributions thead th")
      .allTextContents();
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

  test("editar flujo en aportes recalcula y persiste tras recarga", async ({
    tracker,
  }) => {
    await tracker.openInvestmentContributionsTab();
    const section = tracker.investmentSection();

    // The auto month-end close rows carry no flow of their own (their input
    // defaults to "0") — only the manual (non-month-end) contribution row
    // has a real flow value to edit, so recalculation actually has an effect.
    const editableRow = section.locator("#contribution-body tr", {
      hasText: "2026-01-28",
    });
    await expect(editableRow).toBeVisible();
    const editableDate = (
      await editableRow.locator("td").nth(0).innerText()
    ).trim();

    const downstreamRow = section.locator("#contribution-body tr", {
      hasText: "2026-02-28",
    });
    await expect(downstreamRow).toBeVisible();
    const previousVle = (
      await downstreamRow.locator("td").nth(3).innerText()
    ).trim();

    await tracker.setContributionFlowByDate(editableDate, 0);

    const nextVle = (
      await downstreamRow.locator("td").nth(3).innerText()
    ).trim();
    expect(nextVle).not.toBe(previousVle);

    await tracker.reload();
    await tracker.openInvestmentContributionsTab();
    const persistedVle = (
      await tracker
        .investmentSection()
        .locator("#contribution-body tr", { hasText: "2026-02-28" })
        .locator("td")
        .nth(3)
        .innerText()
    ).trim();
    expect(persistedVle).toBe(nextVle);
  });

  test("aportes muestra también fechas manuales fuera de cierre mensual", async ({
    tracker,
  }) => {
    await tracker.openInvestmentContributionsTab();
    const section = tracker.investmentSection();

    const manualRow = section.locator("#contribution-body tr", {
      hasText: "2026-01-28",
    });
    await expect(manualRow).toBeVisible();
    await expect(
      manualRow.locator('input[data-contribution-flow-date="2026-01-28"]'),
    ).toHaveValue("200");
  });

  test("aportes automáticos de cierre mensual incluyen la liquidez del mes en valor cartera", async ({
    tracker,
  }) => {
    await tracker.openInvestmentContributionsTab();
    const section = tracker.investmentSection();

    const monthEndRow = section.locator("#contribution-body tr", {
      hasText: "2026-01-31",
    });
    await expect(monthEndRow).toBeVisible();
    await expect(monthEndRow.locator("td").nth(1)).toHaveText("11.209,45 €");
    await expect(
      monthEndRow.locator('button[data-delete-contribution-date="2026-01-31"]'),
    ).toHaveCount(0);
  });

  test("aportes manuales se pueden eliminar desde la tabla", async ({
    tracker,
    page,
  }) => {
    await tracker.deleteManualContributionByDate("2026-01-28");
    await expect(page.locator("#contribution-delete-dialog")).toContainText(
      "2026-01-28",
    );
    await tracker.confirmDeleteManualContribution();
    await expect(page.getByRole("status")).toContainText(
      "Aporte manual eliminado.",
    );
    await expect(
      tracker
        .investmentSection()
        .locator("#contribution-body tr", { hasText: "2026-01-28" }),
    ).toHaveCount(0);
  });
});

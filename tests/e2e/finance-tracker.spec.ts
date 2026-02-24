import { test, expect } from "./fixtures";

test.describe("Finance tracker E2E", () => {
  test("sincroniza pestañas con path y permite carga directa por URL", async ({ page, tracker }) => {
    await tracker.openTransactions();
    await expect(page).toHaveURL(/\/movimientos$/);

    await tracker.openInvestment();
    await expect(page).toHaveURL(/\/inversion$/);

    await page.goto("/presupuesto");
    await expect(page).toHaveURL(/\/presupuesto$/);
    await expect(tracker.budgetSection.getByRole("heading", { name: "Presupuesto" })).toBeVisible();

    await tracker.openReports();
    await expect(page).toHaveURL(/\/reportes$/);
    await expect(tracker.reportsSection.getByRole("heading", { name: "Reportes y automatización" })).toBeVisible();
  });

  test("renderiza dashboard con KPIs", async ({ tracker }) => {
    await tracker.openDashboard();
    const incomeText = await tracker.dashboardIncomeText();
    expect(incomeText).toContain("€");
  });

  test("dashboard apila los 3 graficos principales en columnas de ancho completo", async ({ page, tracker }) => {
    await tracker.openDashboard();

    const chartLayout = await page.evaluate(() => {
      const ids = ["chart-networth", "chart-cashflow", "chart-distribution"] as const;
      const cards = ids
        .map((id) => document.getElementById(id)?.closest("article"))
        .filter((element): element is HTMLElement => element instanceof HTMLElement)
        .map((element) => {
          const rect = element.getBoundingClientRect();
          return {
            x: Math.round(rect.x),
            y: Math.round(rect.y),
            width: Math.round(rect.width),
          };
        });

      return cards;
    });

    expect(chartLayout).toHaveLength(3);
    expect(Math.abs(chartLayout[0].x - chartLayout[1].x)).toBeLessThanOrEqual(2);
    expect(Math.abs(chartLayout[1].x - chartLayout[2].x)).toBeLessThanOrEqual(2);
    expect(Math.abs(chartLayout[0].width - chartLayout[1].width)).toBeLessThanOrEqual(2);
    expect(Math.abs(chartLayout[1].width - chartLayout[2].width)).toBeLessThanOrEqual(2);
    expect(chartLayout[1].y).toBeGreaterThan(chartLayout[0].y);
    expect(chartLayout[2].y).toBeGreaterThan(chartLayout[1].y);
  });

  test("dashboard mantiene top gastos a la derecha del bloque de graficas en desktop", async ({ page, tracker }, testInfo) => {
    test.skip(testInfo.project.name === "mobile-chrome", "En móvil el panel lateral baja debajo de las gráficas.");
    await tracker.openDashboard();

    const positions = await page.evaluate(() => {
      const chartStack = document.querySelector<HTMLElement>(".chart-stack");
      const topExpenseCard = document.querySelector<HTMLElement>(".top-expense-card");
      if (!chartStack || !topExpenseCard) {
        return null;
      }
      const stackRect = chartStack.getBoundingClientRect();
      const topRect = topExpenseCard.getBoundingClientRect();
      return {
        stackRight: Math.round(stackRect.right),
        stackTop: Math.round(stackRect.top),
        topLeft: Math.round(topRect.left),
        topTop: Math.round(topRect.top),
      };
    });

    expect(positions).not.toBeNull();
    if (!positions) {
      return;
    }
    expect(positions.topLeft).toBeGreaterThan(positions.stackRight - 4);
    expect(Math.abs(positions.topTop - positions.stackTop)).toBeLessThanOrEqual(8);
  });

  test("dashboard recorta evolucion y cashflow hasta el ultimo mes con datos", async ({ page, tracker }) => {
    await tracker.openDashboard();

    const chartDetails = await page.evaluate(() => {
      const networth = document.getElementById("chart-networth");
      const cashflow = document.getElementById("chart-cashflow");
      if (!networth || !cashflow) {
        return null;
      }

      // Chart.js stores data counts on the container via data attributes set in charts.ts
      return {
        linePointCount: Number(networth.dataset.chartPointCount ?? 0),
        barCount: Number(cashflow.dataset.chartBarCount ?? 0),
      };
    });

    expect(chartDetails).not.toBeNull();
    if (!chartDetails) {
      return;
    }
    // 2 data points (seed data covers Jan-Feb)
    expect(chartDetails.linePointCount).toBe(2);
    // 2 months × 3 series (Ingresos, Gastos, Inversión)
    expect(chartDetails.barCount).toBe(6);
  });

  test("dashboard muestra tooltip funcional al hacer hover en cada grafica", async ({ page, tracker }, testInfo) => {
    test.skip(testInfo.project.name === "mobile-chrome", "Mobile emula interacción táctil y no tiene hover fiable.");
    await tracker.openDashboard();

    // With Chart.js the tooltip is triggered via mousemove on the canvas element.
    // We use Playwright's mouse API to simulate real pointer events.
    const tooltip = page.locator("#chart-tooltip");
    await expect(tooltip).toBeHidden();

    // Hover over the center of the net-worth line chart canvas
    const networthCanvas = page.locator("#chart-networth canvas");
    await networthCanvas.waitFor({ state: "visible" });
    const networthBox = await networthCanvas.boundingBox();
    if (networthBox) {
      await page.mouse.move(networthBox.x + networthBox.width / 2, networthBox.y + networthBox.height / 2);
      await expect(tooltip).toBeVisible();
      await expect(tooltip).toContainText("€");
    }

    // Hover over the cashflow bar chart canvas
    const cashflowCanvas = page.locator("#chart-cashflow canvas");
    await cashflowCanvas.waitFor({ state: "visible" });
    const cashflowBox = await cashflowCanvas.boundingBox();
    if (cashflowBox) {
      await page.mouse.move(cashflowBox.x + cashflowBox.width / 2, cashflowBox.y + cashflowBox.height * 0.6);
      await expect(tooltip).toBeVisible();
    }

    // Hover over the distribution donut chart canvas (left portion where segments are)
    const distCanvas = page.locator("#chart-distribution canvas");
    await distCanvas.waitFor({ state: "visible" });
    const distBox = await distCanvas.boundingBox();
    if (distBox) {
      await page.mouse.move(distBox.x + distBox.width * 0.25, distBox.y + distBox.height / 2);
      await expect(tooltip).toBeVisible();
      await expect(tooltip).toContainText("%");
    }
  });

  test("permite crear movimiento y persiste tras recarga", async ({ tracker }) => {
    await tracker.filterTransactionsMonth("FEBRERO");
    const beforeCount = await tracker.getTransactionRowCount();

    await tracker.addIncomeTransaction({
      date: "2026-02-05",
      monthLabel: "FEBRERO",
      categoryLabel: "Nómina",
      amount: 1234.56,
      description: "Ingreso e2e febrero",
    });

    await tracker.filterTransactionsMonth("FEBRERO");
    const afterCount = await tracker.getTransactionRowCount();
    expect(afterCount).toBe(beforeCount + 1);

    await tracker.reload();
    await tracker.filterTransactionsMonth("FEBRERO");
    expect(await tracker.getTransactionRowCount()).toBe(afterCount);
  });

  test("mantiene datos cuando localStorage se borra porque persiste en servidor", async ({ page, tracker }) => {
    await tracker.filterTransactionsMonth("FEBRERO");
    const beforeCount = await tracker.getTransactionRowCount();

    await tracker.addIncomeTransaction({
      date: "2026-02-11",
      monthLabel: "FEBRERO",
      categoryLabel: "Nómina",
      amount: 888.11,
      description: "sqlite-persist-e2e",
    });

    await tracker.filterTransactionsMonth("FEBRERO");
    const afterCreateCount = await tracker.getTransactionRowCount();
    expect(afterCreateCount).toBe(beforeCount + 1);

    await page.waitForFunction(async () => {
      const namespace = String((window as any).__FINANCE_NAMESPACE__ || "");
      const response = await fetch("/api/state", {
        headers: namespace ? { "x-finance-namespace": namespace } : {},
      });
      if (!response.ok) {
        return false;
      }
      const payload = (await response.json()) as { state?: { transactions?: unknown[] } };
      const transactions = Array.isArray(payload?.state?.transactions) ? payload.state.transactions : [];
      return transactions.some((item: any) => item?.description === "sqlite-persist-e2e");
    });

    await page.evaluate(() => {
      window.localStorage.clear();
    });

    await tracker.reload();
    await tracker.filterTransactionsMonth("FEBRERO");
    await tracker.setTransactionDescriptionFilter("sqlite-persist-e2e");
    await tracker.expectTransactionDescriptionVisible("sqlite-persist-e2e");
  });

  test("permite editar presupuesto mensual y conservarlo", async ({ tracker }) => {
    await tracker.setBudgetValue({
      typeValue: "expense",
      monthLabel: "MARZO",
      categoryLabel: "Comida",
      plannedValue: 432.1,
    });

    expect(await tracker.getBudgetValue("Comida")).toBe(432.1);

    await tracker.reload();
    await tracker.openBudget();
    await tracker.budgetSection.getByLabel("Tipo").selectOption("expense");
    await tracker.budgetSection.getByLabel("Mes").selectOption({ label: "MARZO" });
    expect(await tracker.getBudgetValue("Comida")).toBe(432.1);
  });

  test("permite guardar snapshot de cuenta", async ({ tracker }) => {
    await tracker.saveAccountSnapshot({
      monthLabel: "MARZO",
      accountName: "Revolut",
      value: 999.99,
    });

    expect(await tracker.getAccountSnapshotValue("Revolut")).toBe(999.99);

    await tracker.reload();
    await tracker.openWealth();
    await tracker.wealthSection.getByLabel("Mes snapshot").selectOption({ label: "MARZO" });
    expect(await tracker.getAccountSnapshotValue("Revolut")).toBe(999.99);
  });

  test("patrimonio renderiza la gráfica de evolución mensual solo hasta el último mes con datos", async ({ page, tracker }) => {
    await tracker.openWealth();

    const chartDetails = await page.evaluate(() => {
      const chart = document.getElementById("chart-wealth");
      if (!chart) {
        return null;
      }
      // Chart.js stores data count on the container via data attribute set in charts.ts
      const pointCount = Number(chart.dataset.chartPointCount ?? 0);
      const hasCanvas = !!chart.querySelector("canvas");
      return { pointCount, hasCanvas };
    });

    expect(chartDetails).not.toBeNull();
    if (!chartDetails) {
      return;
    }
    expect(chartDetails.hasCanvas).toBe(true);
    expect(chartDetails.pointCount).toBe(2);
  });

  test("patrimonio permite calcular snapshot de inversión por fila y persistirlo", async ({ tracker }) => {
    const calculated = await tracker.applyInvestmentSnapshotCalculation({
      monthLabel: "MARZO",
      assetName: "Fondos Indexados",
      expression: "100+50*2",
    });
    expect(calculated).toBe(200);

    await tracker.saveSnapshot();
    await tracker.reload();
    await tracker.openWealth();
    await tracker.wealthSection.getByLabel("Mes snapshot").selectOption({ label: "MARZO" });
    expect(await tracker.getInvestmentSnapshotValue("Fondos Indexados")).toBe(200);
  });

  test("movimientos soporta filtrado, orden por columnas y edición inline", async ({ tracker }) => {
    await tracker.addCustomTransaction({
      date: "2026-02-03",
      monthLabel: "FEBRERO",
      type: "income",
      categoryLabel: "Nómina",
      amount: 101,
      description: "e2e-sort-old",
    });
    await tracker.addCustomTransaction({
      date: "2026-02-20",
      monthLabel: "FEBRERO",
      type: "income",
      categoryLabel: "Nómina",
      amount: 202,
      description: "e2e-sort-new",
    });

    await tracker.filterTransactionsMonth("FEBRERO");
    await tracker.setTransactionDescriptionFilter("e2e-sort");
    expect(await tracker.firstTransactionDateText()).toBe("2026-02-20");

    await tracker.clickSortByDate();
    expect(await tracker.firstTransactionDateText()).toBe("2026-02-03");

    await tracker.editTransactionByDescription("e2e-sort-old", {
      amount: 303,
      newDescription: "e2e-sort-old-edited",
      category: "Nómina",
    });
    await tracker.expectTransactionDescriptionVisible("e2e-sort-old-edited");

    await tracker.reload();
    await tracker.filterTransactionsMonth("FEBRERO");
    await tracker.setTransactionDescriptionFilter("e2e-sort");
    await tracker.expectTransactionDescriptionVisible("e2e-sort-old-edited");
    await tracker.clearTransactionFilters();
  });

  test("movimientos muestra columnas en orden: fecha, descripción, importe, cuenta, tipo, categoría", async ({ page, tracker }) => {
    await page.goto("/movimientos");
    await expect(page).toHaveURL(/\/movimientos$/);

    const headers = await tracker.transactionsSection.locator("thead th").allInnerTexts();
    const filteredHeaders = headers.map((text) => text.trim()).filter((text) => text !== "");

    expect(filteredHeaders[0]).toBe("");
    expect(filteredHeaders[1]).toContain("Fecha");
    expect(filteredHeaders[2]).toContain("Descripción");
    expect(filteredHeaders[3]).toContain("Importe");
    expect(filteredHeaders[4]).toContain("Cuenta");
    expect(filteredHeaders[5]).toContain("Tipo");
    expect(filteredHeaders[6]).toContain("Categoría");
    expect(filteredHeaders[7]).toBe("Acciones");
  });

  test("movimientos inicia con popovers de filtros ocultos en header", async ({ page, tracker }) => {
    await page.goto("/movimientos");
    await expect(page).toHaveURL(/\/movimientos$/);
    await expect(tracker.transactionsSection.getByRole("heading", { name: "Movimientos mensuales" })).toBeVisible();
    await expect(tracker.transactionsSection.getByRole("heading", { name: "Orden y filtros de tabla" })).toHaveCount(0);

    const popovers = tracker.transactionsSection.locator(".tx-filter-popover");
    await expect(popovers).toHaveCount(6);
    for (let index = 0; index < 6; index += 1) {
      await expect(popovers.nth(index)).toBeHidden();
    }

    const dateFilterTrigger = tracker.transactionsSection.locator('.tx-filter-trigger[data-column="date"]');
    await dateFilterTrigger.click();
    await expect(tracker.transactionsSection.locator('.tx-filter-popover[data-column="date"]')).toBeVisible();
    await expect(tracker.transactionsSection.locator('.tx-filter-popover[data-column="account"]')).toBeHidden();
  });

  test("movimientos muestra resumen lateral con totales y desglose por categorías", async ({ page, tracker }, testInfo) => {
    test.skip(testInfo.project.name === "mobile-chrome", "En móvil el lateral baja debajo de la tabla.");
    await page.goto("/movimientos");
    await expect(page).toHaveURL(/\/movimientos$/);
    await tracker.filterTransactionsMonth("FEBRERO");

    await expect(tracker.transactionsSummarySection).toBeVisible();
    await expect(tracker.transactionsSection.locator(".tx-summary-title", { hasText: "TOTAL" })).toBeVisible();
    await expect(
      tracker.transactionsSection.locator(".tx-summary-title", { hasText: "DESGLOSE POR CATEGORÍAS" })
    ).toBeVisible();

    expect(await tracker.getTransactionSummaryTotal("income")).toBeCloseTo(1808, 2);
    expect(await tracker.getTransactionSummaryTotal("expense")).toBeCloseTo(752.1, 2);
    expect(await tracker.getTransactionSummaryTotal("investment")).toBeCloseTo(360, 2);

    expect(await tracker.getTransactionSummaryCategoryAmount("income", "Nómina")).toBeCloseTo(1508, 2);
    expect(await tracker.getTransactionSummaryCategoryAmount("expense", "Viajes")).toBeCloseTo(436.63, 2);
    expect(await tracker.getTransactionSummaryCategoryAmount("investment", "Crypto")).toBeCloseTo(160, 2);

    await expect(tracker.transactionsSection.locator("#tx-category-breakdown-body")).toContainText("💼 Nómina");
    await expect(tracker.transactionsSection.locator("#tx-category-breakdown-body")).toContainText("✈️ Viajes");
    await expect(tracker.transactionsSection.locator("#tx-category-breakdown-body")).toContainText("₿ Crypto");
  });

  test("home no muestra bloque legacy de filtros en movimientos", async ({ page, tracker }) => {
    await page.goto("/");
    await expect(page).toHaveURL(/\/$/);
    await tracker.openTransactions();
    await expect(tracker.transactionsSection.getByRole("heading", { name: "Orden y filtros de tabla" })).toHaveCount(0);
  });

  test("movimientos permite filtros multiseleccion en popovers y cierra con un click fuera", async ({ tracker }, testInfo) => {
    test.skip(
      testInfo.project.name === "mobile-chrome",
      "La selección múltiple de checkboxes en popover no es estable en emulación táctil."
    );
    await tracker.addCustomTransaction({
      date: "2026-03-03",
      monthLabel: "MARZO",
      type: "income",
      categoryLabel: "Nómina",
      amount: 301,
      description: "e2e-multi-income",
    });
    await tracker.addCustomTransaction({
      date: "2026-03-04",
      monthLabel: "MARZO",
      type: "expense",
      categoryLabel: "Comida",
      amount: 302,
      description: "e2e-multi-expense",
    });
    await tracker.addCustomTransaction({
      date: "2026-03-05",
      monthLabel: "MARZO",
      type: "investment",
      categoryLabel: "Fondos Indexados",
      amount: 303,
      description: "e2e-multi-investment",
    });

    await tracker.filterTransactionsMonth("MARZO");
    await tracker.setTransactionDescriptionFilter("e2e-multi");

    const typeTrigger = tracker.transactionsSection.locator('.tx-filter-trigger[data-column="type"]');
    const typePopover = tracker.transactionsSection.locator('.tx-filter-popover[data-column="type"]');
    await typeTrigger.click();
    await expect(typePopover).toBeVisible();

    await tracker.transactionsSection
      .locator('#tx-header-filter-type input[type="checkbox"][data-filter-value="expense"]')
      .click({ force: true });
    await tracker.transactionsSection
      .locator('#tx-header-filter-type input[type="checkbox"][data-filter-value="investment"]')
      .click({ force: true });

    await expect(tracker.transactionsSection.locator("#tx-table-body tr", { hasText: "e2e-multi-expense" })).toHaveCount(1);
    await expect(tracker.transactionsSection.locator("#tx-table-body tr", { hasText: "e2e-multi-investment" })).toHaveCount(1);
    await expect(tracker.transactionsSection.locator("#tx-table-body tr", { hasText: "e2e-multi-income" })).toHaveCount(0);

    await tracker.transactionsSection.getByRole("heading", { name: "Movimientos mensuales" }).click();
    await expect(typePopover).toBeHidden();

    const accountTrigger = tracker.transactionsSection.locator('.tx-filter-trigger[data-column="account"]');
    await accountTrigger.click();
    const accountChecks = tracker.transactionsSection.locator('#tx-header-filter-account input[type="checkbox"]');
    if ((await accountChecks.count()) >= 2) {
      await accountChecks.nth(0).click({ force: true });
      await accountChecks.nth(1).click({ force: true });
      await expect(tracker.transactionsSection.locator('#tx-header-filter-account input[type="checkbox"]:checked')).toHaveCount(2);
    }

    await tracker.clearTransactionFilters();
  });

  test("movimientos soporta modal con 'Otro' y acciones masivas", async ({ tracker }) => {
    await tracker.addCustomTransactionKeepOpen({
      date: "2026-03-11",
      monthLabel: "MARZO",
      type: "expense",
      categoryLabel: "Comida",
      amount: 11,
      description: "e2e-bulk-a",
    });
    expect(await tracker.transactionModalDateValue()).toBe("2026-03-11");

    await tracker.addCustomTransaction({
      date: "2026-03-12",
      monthLabel: "MARZO",
      type: "expense",
      categoryLabel: "Comida",
      amount: 12,
      description: "e2e-bulk-b",
    });

    await tracker.filterTransactionsMonth("MARZO");
    await tracker.setTransactionDescriptionFilter("e2e-bulk");
    await tracker.selectTransactionByDescription("e2e-bulk-a");
    await tracker.selectTransactionByDescription("e2e-bulk-b");
    await tracker.applyBulkTransactionChanges({
      type: "investment",
      category: "Fondos Indexados",
    });
    await expect(tracker.transactionsSection.locator("#tx-table-body")).toContainText("📈 Fondos Indexados");
    await expect(tracker.transactionsSection.locator("#tx-table-body tr", { hasText: "Fondos Indexados" })).toHaveCount(2);

    await tracker.selectTransactionByDescription("e2e-bulk-a");
    await tracker.selectTransactionByDescription("e2e-bulk-b");
    await tracker.deleteSelectedTransactions();
    expect(await tracker.getTransactionRowCount()).toBe(0);
    await tracker.clearTransactionFilters();
  });

  test("movimientos mantiene abierto popover de filtro al seleccionar texto y soltar fuera", async ({ page, tracker }, testInfo) => {
    test.skip(
      testInfo.project.name === "mobile-chrome",
      "La selección con arrastre y ratón no aplica de forma fiable en emulación táctil."
    );
    await page.goto("/movimientos");
    await expect(page).toHaveURL(/\/movimientos$/);
    await expect(tracker.transactionsSection.getByRole("heading", { name: "Movimientos mensuales" })).toBeVisible();

    const trigger = tracker.transactionsSection.locator('.tx-filter-trigger[data-column="description"]');
    const popover = tracker.transactionsSection.locator('.tx-filter-popover[data-column="description"]');
    const input = tracker.transactionsSection.locator("#tx-header-filter-description");

    await trigger.click();
    await expect(popover).toBeVisible();
    await input.fill("texto seleccionable para e2e");

    const box = await input.boundingBox();
    expect(box).not.toBeNull();
    if (!box) {
      return;
    }

    await page.mouse.move(box.x + 8, box.y + box.height / 2);
    await page.mouse.down();
    await page.mouse.move(box.x + box.width + 120, box.y + box.height / 2);
    await page.mouse.up();

    await expect(popover).toBeVisible();
  });

  test("movimientos mantiene abierto modal al seleccionar texto y soltar fuera", async ({ page, tracker }) => {
    await page.goto("/movimientos");
    await expect(page).toHaveURL(/\/movimientos$/);
    await expect(tracker.transactionsSection.getByRole("heading", { name: "Movimientos mensuales" })).toBeVisible();

    const openModalButton = tracker.transactionsSection.getByRole("button", { name: "Nuevo" });
    const dialog = tracker.transactionsSection.locator("#tx-dialog");
    const descriptionInput = tracker.transactionsSection.locator('#tx-form input[name="description"]');

    await openModalButton.click();
    await expect(dialog).toBeVisible();
    await descriptionInput.fill("seleccion en modal para e2e");

    const box = await descriptionInput.boundingBox();
    expect(box).not.toBeNull();
    if (!box) {
      return;
    }

    await page.mouse.move(box.x + 8, box.y + box.height / 2);
    await page.mouse.down();
    await page.mouse.move(box.x + box.width + 160, box.y + box.height / 2);
    await page.mouse.up();

    const isOpen = await dialog.evaluate((element) => (element as HTMLDialogElement).open);
    expect(isOpen).toBe(true);
  });

  test("datos crea issue de bug y muestra confirmación", async ({ page, tracker }) => {
    await page.route("**/api/issues/report", async (route) => {
      await route.fulfill({
        status: 201,
        contentType: "application/json",
        body: JSON.stringify({
          ok: true,
          issueNumber: 321,
          issueUrl: "https://github.com/example/repo/issues/321",
        }),
      });
    });

    await tracker.submitIssueReport({
      type: "bug",
      summary: "Error guardando datos",
      description: "Después de guardar no persiste el estado.",
      stepsToReproduce: "1. Ir a datos\n2. Guardar\n3. Recargar",
    });

    await expect(tracker.issueReportStatus()).toContainText("Issue creada:");
    await expect(tracker.issueReportStatus().locator("a")).toHaveAttribute(
      "href",
      "https://github.com/example/repo/issues/321"
    );
  });

  test("datos crea issue de mejora y muestra confirmación", async ({ page, tracker }) => {
    await page.route("**/api/issues/report", async (route) => {
      await route.fulfill({
        status: 201,
        contentType: "application/json",
        body: JSON.stringify({
          ok: true,
          issueNumber: 654,
          issueUrl: "https://github.com/example/repo/issues/654",
        }),
      });
    });

    await tracker.submitIssueReport({
      type: "enhancement",
      summary: "Mejorar feedback visual",
      description: "Quiero ver un estado más claro al crear reportes.",
      mentionClaude: true,
    });

    await expect(tracker.issueReportStatus()).toContainText("#654");
  });

  test("datos muestra validación específica cuando resumen o descripción no cumplen mínimo", async ({ tracker }) => {
    await tracker.openReports();
    const form = tracker.reportsSection.locator("#issue-report-form");
    await form.locator("#issue-report-summary").fill("abc");
    await form.locator("#issue-report-description").fill("corta");
    await form.getByRole("button", { name: "Crear issue" }).click();
    await expect(tracker.issueReportStatus()).toContainText("el resumen debe tener al menos 5 caracteres");
  });

  test("datos muestra error cuando falla la API de reporte", async ({ page, tracker }) => {
    await page.route("**/api/issues/report", async (route) => {
      await route.fulfill({
        status: 500,
        contentType: "application/json",
        body: JSON.stringify({ ok: false, error: "GitHub no disponible" }),
      });
    });

    await tracker.submitIssueReport({
      type: "bug",
      summary: "Error en endpoint",
      description: "Prueba de manejo de error al crear issue.",
    });

    await expect(tracker.issueReportStatus()).toContainText("No se pudo crear la issue: GitHub no disponible");
  });
});

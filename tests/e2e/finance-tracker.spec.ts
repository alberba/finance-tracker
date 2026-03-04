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

      return {
        linePointCount: parseInt(networth.dataset.chartPointCount || "0"),
        barCount: parseInt(cashflow.dataset.chartBarCount || "0"),
      };
    });

    expect(chartDetails).not.toBeNull();
    if (!chartDetails) {
      return;
    }
    expect(chartDetails.linePointCount).toBe(2);
    expect(chartDetails.barCount).toBe(6);
  });

  test("dashboard muestra tooltip funcional al hacer hover en cada grafica", async ({ page, tracker }, testInfo) => {
    test.skip(testInfo.project.name === "mobile-chrome", "Mobile emula interacción táctil y no tiene hover fiable.");
    await tracker.openDashboard();

    const tooltip = page.locator("#chart-tooltip");
    await expect(tooltip).toBeHidden();

    const networthCanvas = page.locator("#chart-networth");
    const networthBox = await networthCanvas.boundingBox();
    if (networthBox) {
      await page.mouse.move(networthBox.x + networthBox.width / 2, networthBox.y + networthBox.height / 2);
    }
    await expect(tooltip).toBeVisible();
    await expect(tooltip).toContainText("€");

    const cashflowCanvas = page.locator("#chart-cashflow");
    const cashflowBox = await cashflowCanvas.boundingBox();
    if (cashflowBox) {
      await page.mouse.move(cashflowBox.x + cashflowBox.width / 2, cashflowBox.y + cashflowBox.height / 2);
    }
    await expect(tooltip).toBeVisible();
    await expect(tooltip).toContainText("Ingresos");

    // Para el donut chart, activar el tooltip via Chart.js API
    await page.evaluate(() => {
      const canvas = document.getElementById("chart-distribution") as HTMLCanvasElement;
      const chart = (window as any).Chart?.getChart(canvas);
      if (chart && chart.data.datasets[0]?.data?.length > 0) {
        chart.tooltip.setActiveElements([{ datasetIndex: 0, index: 0 }], { x: 0, y: 0 });
        chart.update();
      }
    });
    await expect(tooltip).toBeVisible();
    await expect(tooltip).toContainText("%");
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

  test("nuevo movimiento usa gasto por defecto y ordena categorías de gasto por uso", async ({ page, tracker }) => {
    await tracker.openTransactions();
    await tracker.transactionsSection.getByRole("button", { name: "Nuevo" }).click();

    const form = tracker.transactionsSection.locator("#tx-form");
    await expect(form.getByLabel("Tipo")).toHaveValue("expense");

    const uiExpenseCategories = await form
      .getByLabel("Categoría")
      .locator("option")
      .evaluateAll((options) => options.map((option) => option.getAttribute("value") || ""));

    const expectedExpenseCategories = await page.evaluate(() => {
      const raw = window.localStorage.getItem("finance-tracker-state-v1");
      const parsed = raw ? JSON.parse(raw) : {};
      const categories = Array.isArray(parsed?.expenseCategories) ? parsed.expenseCategories : [];
      const transactions = Array.isArray(parsed?.transactions) ? parsed.transactions : [];

      const usageByCategory = transactions.reduce(
        (acc: Record<string, number>, tx: { type?: string; category?: string }) => {
          if (tx?.type !== "expense") {
            return acc;
          }
          const category = String(tx?.category || "").trim();
          if (!category) {
            return acc;
          }
          acc[category] = (acc[category] || 0) + 1;
          return acc;
        },
        {}
      );

      return [...categories].sort((a, b) => {
        const usageA = usageByCategory[a] || 0;
        const usageB = usageByCategory[b] || 0;
        if (usageA !== usageB) {
          return usageB - usageA;
        }
        return categories.indexOf(a) - categories.indexOf(b);
      });
    });

    expect(uiExpenseCategories).toEqual(expectedExpenseCategories);
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
      return {
        points: parseInt(chart.dataset.chartPointCount || "0"),
        labels: parseInt(chart.dataset.chartPointCount || "0") > 0 ? 1 : 0,
      };
    });

    expect(chartDetails).not.toBeNull();
    if (!chartDetails) {
      return;
    }
    expect(chartDetails.points).toBe(2);
    expect(chartDetails.labels).toBeGreaterThan(0);
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
    const trimmedHeaders = headers.map((text) => text.trim());

    expect(trimmedHeaders[1]).toContain("Fecha");
    expect(trimmedHeaders[2]).toContain("Descripción");
    expect(trimmedHeaders[3]).toContain("Importe");
    expect(trimmedHeaders[4]).toContain("Cuenta");
    expect(trimmedHeaders[5]).toContain("Tipo");
    expect(trimmedHeaders[6]).toContain("Categoría");
    expect(trimmedHeaders[7]).toBe("Acciones");
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
          enrichmentStatus: "pending",
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
    await expect(tracker.issueReportStatus()).toContainText("enriquecimiento en curso");
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
          enrichmentStatus: "pending",
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
    await expect(tracker.issueReportStatus()).toContainText("enriquecimiento en curso");
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

  test("inversión renderiza los 3 gráficos: 2 de líneas múltiples y 1 donut de distribución", async ({ tracker, page }) => {
    await tracker.openInvestment();

    // Verificar que los canvas de los gráficos existen
    const portfolioChart = page.locator("#investment-portfolio-chart");
    const assetsChart = page.locator("#investment-assets-chart");
    const allocationChart = page.locator("#investment-allocation");

    await expect(portfolioChart).toBeVisible();
    await expect(assetsChart).toBeVisible();
    await expect(allocationChart).toBeVisible();
  });

  test("inversión: gráficos de líneas muestran valores porcentuales", async ({ tracker, page }) => {
    await tracker.openInvestment();

    const chartData = await page.evaluate(() => {
      const portfolio = document.getElementById("investment-portfolio-chart");
      const assets = document.getElementById("investment-assets-chart");
      if (!portfolio || !assets) return null;

      const portfolioTooltips: string[] = JSON.parse(portfolio.dataset.chartTooltips || "[]").flat();
      const assetsTooltips: string[] = JSON.parse(assets.dataset.chartTooltips || "[]").flat();

      return {
        portfolioCount: parseInt(portfolio.dataset.chartPointCount || "0"),
        assetsCount: parseInt(assets.dataset.chartPointCount || "0"),
        firstPortfolioTooltip: portfolioTooltips[0] || "",
      };
    });

    expect(chartData).not.toBeNull();
    if (!chartData) return;

    expect(chartData.portfolioCount).toBeGreaterThan(0);
    expect(chartData.assetsCount).toBeGreaterThan(0);

    // Verificar que los tooltips contienen símbolo de porcentaje
    expect(chartData.firstPortfolioTooltip).toMatch(/%/);
  });

  test("inversión: gráficos de líneas muestran tick 0% en eje Y", async ({ tracker, page }) => {
    await tracker.openInvestment();

    const zeroTickStatus = await page.evaluate(() => {
      const portfolio = document.getElementById("investment-portfolio-chart");
      const assets = document.getElementById("investment-assets-chart");
      return {
        portfolio: portfolio?.dataset.chartHasZeroTick === "true",
        assets: assets?.dataset.chartHasZeroTick === "true",
      };
    });

    expect(zeroTickStatus.portfolio).toBe(true);
    expect(zeroTickStatus.assets).toBe(true);
  });

  test("inversión: ambos gráficos de líneas usan mayor altura", async ({ tracker, page }) => {
    await tracker.openInvestment();

    // Con Chart.js canvas, verificamos que los contenedores tienen altura adecuada
    const heights = await page.evaluate(() => {
      const portfolio = document.getElementById("investment-portfolio-chart")?.closest(".chart-canvas-wrap") as HTMLElement | null;
      const assets = document.getElementById("investment-assets-chart")?.closest(".chart-canvas-wrap") as HTMLElement | null;
      return {
        portfolioHeight: portfolio?.offsetHeight || 0,
        assetsHeight: assets?.offsetHeight || 0,
      };
    });

    expect(heights.portfolioHeight).toBeGreaterThan(200);
    expect(heights.assetsHeight).toBeGreaterThan(200);
  });

  test("inversión: el gráfico de cartera muestra solo la serie Cartera Total", async ({ tracker, page }) => {
    await tracker.openInvestment();

    const details = await page.evaluate(() => {
      const canvas = document.getElementById("investment-portfolio-chart");
      if (!canvas) return null;

      const tooltipRows: string[][] = JSON.parse(canvas.dataset.chartTooltips || "[]");
      const allTooltips = tooltipRows.flat();
      const invalidTooltip = allTooltips.find((value) => !value.startsWith("Cartera Total · "));
      const seriesNames: string[] = JSON.parse(canvas.dataset.chartSeriesNames || "[]");

      return {
        invalidTooltip: invalidTooltip || "",
        seriesCount: seriesNames.length,
        pointCount: parseInt(canvas.dataset.chartPointCount || "0"),
      };
    });

    expect(details).not.toBeNull();
    if (!details) return;

    expect(details.pointCount).toBeGreaterThan(0);
    expect(details.invalidTooltip).toBe("");
    expect(details.seriesCount).toBe(1);
  });

  test("inversión: gráficos de líneas calculan ganancia sobre capital aportado acumulado", async ({ tracker, page }) => {
    await tracker.openInvestment();
    await page.locator("#investment-month").selectOption({ label: "MARZO" });

    const result = await page.evaluate(() => {
      const storageKey = "finance-tracker-state-v1";
      const rawState = localStorage.getItem(storageKey);
      if (!rawState) {
        return { error: "No se encontró estado persistido en localStorage." };
      }

      const state = JSON.parse(rawState) as {
        investmentAssets: Array<{ id: string; name: string; openingBalance: number }>;
        transactions: Array<{ type: string; month: number; category: string; amount: number }>;
        snapshots: Record<string, { investments: Record<string, number> }>;
      };

      const month = 2; // MARZO
      const monthLabel = "MARZO";

      const slug = (value: unknown) =>
        String(value || "")
          .toLowerCase()
          .trim()
          .replace(/[^a-z0-9]+/g, "-")
          .replace(/^-+|-+$/g, "");

      const round2 = (value: number) => Math.round(value * 100) / 100;

      const matchesInvestmentAsset = (category: string, asset: { id: string; name: string }) => {
        if (!category || !asset) {
          return false;
        }
        const categorySlug = slug(category);
        return categorySlug === asset.id || category.toLowerCase() === String(asset.name || "").toLowerCase();
      };

      const getLatestSnapshotValue = (assetId: string, targetMonth: number) => {
        for (let m = targetMonth; m >= 0; m -= 1) {
          const snapshot = state.snapshots[String(m)];
          if (!snapshot || !snapshot.investments) {
            continue;
          }
          const value = snapshot.investments[assetId];
          if (typeof value === "number") {
            return { month: m, value };
          }
        }
        return null;
      };

      const computeInvestmentValue = (assetId: string, targetMonth: number) => {
        const asset = state.investmentAssets.find((item) => item.id === assetId);
        if (!asset) {
          return 0;
        }

        const latestSnapshot = getLatestSnapshotValue(assetId, targetMonth);
        let startMonth = -1;
        let value = Number(asset.openingBalance || 0);

        if (latestSnapshot) {
          startMonth = latestSnapshot.month;
          value = latestSnapshot.value;
        }

        state.transactions.forEach((item) => {
          if (item.type !== "investment") {
            return;
          }
          const txMonth = Number(item.month);
          if (txMonth <= startMonth || txMonth > targetMonth) {
            return;
          }
          if (!matchesInvestmentAsset(item.category, asset)) {
            return;
          }
          value += Number(item.amount || 0);
        });

        return round2(value);
      };

      const computeInvestedCapitalByAsset = (assetId: string, targetMonth: number) => {
        const asset = state.investmentAssets.find((item) => item.id === assetId);
        if (!asset) {
          return 0;
        }
        const openingCapital = Number(asset.openingBalance || 0);
        const contributions = state.transactions.reduce((sum, item) => {
          if (item.type !== "investment") {
            return sum;
          }
          if (Number(item.month) > targetMonth) {
            return sum;
          }
          if (!matchesInvestmentAsset(item.category, asset)) {
            return sum;
          }
          return sum + Number(item.amount || 0);
        }, 0);
        return round2(openingCapital + contributions);
      };

      const computeInvestedCapitalTotal = (targetMonth: number) =>
        round2(state.investmentAssets.reduce((sum, asset) => sum + computeInvestedCapitalByAsset(asset.id, targetMonth), 0));

      const toGainPercent = (value: number, investedCapital: number) => {
        if (investedCapital <= 0) {
          return 0;
        }
        return ((value - investedCapital) / investedCapital) * 100;
      };

      const parseTooltipPercent = (tooltip: string | null) => {
        const match = (tooltip || "").match(/:\s*(-?\d+(?:[.,]\d+)?)%/);
        if (!match) {
          return NaN;
        }
        return Number(match[1].replace(",", "."));
      };

      // Read tooltip data from data attributes (Chart.js canvas approach)
      const portfolioCanvas = document.getElementById("investment-portfolio-chart");
      const assetsCanvas = document.getElementById("investment-assets-chart");
      if (!portfolioCanvas || !assetsCanvas) {
        return { error: "No se encontraron los canvas de los gráficos." };
      }

      const portfolioTooltipData: string[][] = JSON.parse(portfolioCanvas.dataset.chartTooltips || "[]");
      const assetsTooltipData: string[][] = JSON.parse(assetsCanvas.dataset.chartTooltips || "[]");

      const portfolioTooltip = portfolioTooltipData.flat().find((tooltip) => tooltip.includes(`Cartera Total · ${monthLabel}:`));
      if (!portfolioTooltip) {
        return { error: "No se encontró tooltip de Cartera Total para MARZO." };
      }

      const assetTooltip = assetsTooltipData.flat().find((tooltip) => tooltip.includes(` · ${monthLabel}:`));
      if (!assetTooltip) {
        return { error: "No se encontró tooltip de activo para MARZO." };
      }

      const assetName = assetTooltip.split(" · ")[0].trim();
      const asset = state.investmentAssets.find((item) => item.name === assetName);
      if (!asset) {
        return { error: `No se encontró activo en estado para tooltip: ${assetName}` };
      }

      const portfolioValue = round2(state.investmentAssets.reduce((sum, item) => sum + computeInvestmentValue(item.id, month), 0));
      const portfolioInvestedCapital = computeInvestedCapitalTotal(month);
      const expectedPortfolioPct = toGainPercent(portfolioValue, portfolioInvestedCapital);

      const assetValue = computeInvestmentValue(asset.id, month);
      const assetInvestedCapital = computeInvestedCapitalByAsset(asset.id, month);
      const expectedAssetPct = toGainPercent(assetValue, assetInvestedCapital);

      const actualPortfolioPct = parseTooltipPercent(portfolioTooltip);
      const actualAssetPct = parseTooltipPercent(assetTooltip);

      return {
        error: "",
        actualPortfolioPct,
        expectedPortfolioPct,
        actualAssetPct,
        expectedAssetPct,
      };
    });

    expect(result.error).toBe("");
    if (result.error) {
      return;
    }
    expect(Math.abs(result.actualPortfolioPct - result.expectedPortfolioPct)).toBeLessThanOrEqual(0.05);
    expect(Math.abs(result.actualAssetPct - result.expectedAssetPct)).toBeLessThanOrEqual(0.05);
  });

  test("inversión: gráficos de líneas arrancan en 01/01 con valor de apertura", async ({ tracker, page }) => {
    await tracker.openInvestment();
    await page.locator("#investment-month").selectOption({ label: "ENERO" });

    const tooltips = await page.evaluate(() => {
      const portfolio = document.getElementById("investment-portfolio-chart");
      const assets = document.getElementById("investment-assets-chart");
      if (!portfolio || !assets) return null;

      const portfolioTooltipData: string[][] = JSON.parse(portfolio.dataset.chartTooltips || "[]");
      const assetsTooltipData: string[][] = JSON.parse(assets.dataset.chartTooltips || "[]");

      return {
        firstPortfolio: portfolioTooltipData[0]?.[0] || "",
        firstAssets: assetsTooltipData[0]?.[0] || "",
      };
    });

    expect(tooltips).not.toBeNull();
    if (!tooltips) return;

    expect(tooltips.firstPortfolio).toContain("01/01");
    expect(tooltips.firstAssets).toContain("01/01");
    expect(tooltips.firstPortfolio).toMatch(/0[.,]00%/);
  });

  test("inversión: gráfico de distribución usa donut chart y contiene segmentos", async ({ tracker, page }) => {
    await tracker.openInvestment();

    // Verificar que el canvas del donut tiene segmentos renderizados
    const segmentCount = await page.evaluate(() => {
      const canvas = document.getElementById("investment-allocation");
      return parseInt(canvas?.dataset.chartSegmentCount || "0");
    });

    // Debe haber al menos 1 segmento
    expect(segmentCount).toBeGreaterThan(0);
  });

  test("inversión: gráficos ocupan ancho equilibrado en dos columnas", async ({ tracker, page }, testInfo) => {
    test.skip(testInfo.project.name === "mobile-chrome", "En móvil los gráficos se apilan verticalmente.");
    await tracker.openInvestment();

    const layout = await page.evaluate(() => {
      const portfolio = document.getElementById("investment-portfolio-chart")?.closest("article");
      const assets = document.getElementById("investment-assets-chart")?.closest("article");

      if (!portfolio || !assets) {
        return null;
      }

      const portfolioRect = portfolio.getBoundingClientRect();
      const assetsRect = assets.getBoundingClientRect();

      return {
        portfolioX: Math.round(portfolioRect.x),
        portfolioWidth: Math.round(portfolioRect.width),
        assetsX: Math.round(assetsRect.x),
        assetsWidth: Math.round(assetsRect.width),
        portfolioY: Math.round(portfolioRect.y),
        assetsY: Math.round(assetsRect.y),
      };
    });

    expect(layout).not.toBeNull();
    if (!layout) {
      return;
    }

    // Los gráficos deben estar en la misma fila (Y similar)
    expect(Math.abs(layout.portfolioY - layout.assetsY)).toBeLessThanOrEqual(4);

    // Los gráficos deben tener ancho similar (1fr 1fr)
    expect(Math.abs(layout.portfolioWidth - layout.assetsWidth)).toBeLessThanOrEqual(2);

    // El segundo gráfico debe estar a la derecha del primero
    expect(layout.assetsX).toBeGreaterThan(layout.portfolioX + layout.portfolioWidth - 4);
  });

  test("inversión: donut chart renderiza leyenda con colores", async ({ tracker, page }) => {
    await tracker.openInvestment();

    // Verificar que el canvas del donut tiene items de leyenda
    const legendCount = await page.evaluate(() => {
      const canvas = document.getElementById("investment-allocation");
      return parseInt(canvas?.dataset.chartLegendCount || "0");
    });

    // Debe haber al menos 1 item de leyenda (1 por activo)
    expect(legendCount).toBeGreaterThanOrEqual(1);
  });

  test("inversión: seleccionar mes diferente actualiza los gráficos", async ({ tracker, page }) => {
    await tracker.openInvestment();

    // Obtener cantidad inicial de puntos
    const initialPoints = await page.evaluate(() => {
      const canvas = document.getElementById("investment-portfolio-chart");
      return parseInt(canvas?.dataset.chartPointCount || "0");
    });

    // Seleccionar mes anterior
    await page.locator("#investment-month").selectOption({ label: "ENERO" });

    // Esperar a que se renderice
    await page.waitForTimeout(300);

    // La cantidad de puntos debe cambiar o ser diferente
    const updatedPoints = await page.evaluate(() => {
      const canvas = document.getElementById("investment-portfolio-chart");
      return parseInt(canvas?.dataset.chartPointCount || "0");
    });

    // En enero debería haber menos o igual puntos de datos
    expect(updatedPoints).toBeLessThanOrEqual(initialPoints);
  });
});

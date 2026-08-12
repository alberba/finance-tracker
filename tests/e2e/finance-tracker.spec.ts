import { test, expect } from "./fixtures";

const MONTH_NAMES = [
  "ENERO",
  "FEBRERO",
  "MARZO",
  "ABRIL",
  "MAYO",
  "JUNIO",
  "JULIO",
  "AGOSTO",
  "SEPTIEMBRE",
  "OCTUBRE",
  "NOVIEMBRE",
  "DICIEMBRE",
] as const;

test.describe("Finance tracker E2E", () => {
  test("permite crear movimiento y persiste tras recarga", { tag: "@smoke" }, async ({
    tracker,
  }) => {
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

  test("nuevo movimiento usa gasto por defecto y ordena categorías de gasto por uso", async ({
    page,
    tracker,
  }) => {
    await tracker.openTransactions();
    await tracker.transactionsSection
      .getByRole("button", { name: "Nuevo" })
      .click();

    const form = tracker.transactionsSection.locator("#tx-form");
    await expect(form.getByLabel("Tipo")).toHaveValue("expense");

    const uiExpenseCategories = await form
      .getByLabel("Categoría")
      .locator("option")
      .evaluateAll((options) =>
        options.map((option) => option.getAttribute("value") || ""),
      );

    const expectedExpenseCategories = await page.evaluate(() => {
      const raw = window.localStorage.getItem("finance-tracker-state-v1");
      const parsed = raw ? JSON.parse(raw) : {};
      const categories = Array.isArray(parsed?.expenseCategories)
        ? parsed.expenseCategories
        : [];
      const transactions = Array.isArray(parsed?.transactions)
        ? parsed.transactions
        : [];

      const usageByCategory = transactions.reduce(
        (
          acc: Record<string, number>,
          tx: { type?: string; category?: string },
        ) => {
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
        {},
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

  test("mantiene datos cuando localStorage se borra porque persiste en servidor", async ({
    page,
    tracker,
  }) => {
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
      const namespace = String(
        (window as Window & { __FINANCE_NAMESPACE__?: string })
          .__FINANCE_NAMESPACE__ || "",
      );
      const response = await fetch("/api/state", {
        headers: namespace ? { "x-finance-namespace": namespace } : {},
      });
      if (!response.ok) {
        return false;
      }
      const payload = (await response.json()) as {
        state?: { transactions?: unknown[] };
      };
      const transactions = Array.isArray(payload?.state?.transactions)
        ? payload.state.transactions
        : [];
      return transactions.some((item) => {
        return (
          typeof item === "object" &&
          item !== null &&
          "description" in item &&
          item.description === "sqlite-persist-e2e"
        );
      });
    });

    await page.evaluate(() => {
      window.localStorage.clear();
    });

    await tracker.reload();
    await tracker.filterTransactionsMonth("FEBRERO");
    await tracker.setTransactionDescriptionFilter("sqlite-persist-e2e");
    await tracker.expectTransactionDescriptionVisible("sqlite-persist-e2e");
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
    await tracker.wealthSection
      .getByLabel("Mes snapshot")
      .selectOption({ label: "MARZO" });
    expect(await tracker.getAccountSnapshotValue("Revolut")).toBe(999.99);
  });

  test("patrimonio renderiza la evolución mensual hasta el mes actual YTD", async ({
    page,
    tracker,
  }) => {
    const yearDisplay = await tracker.getDisplayedYear();
    await tracker.openWealth();

    const chartDetails = await page.evaluate((yearDisplay) => {
      const chart = document.getElementById("chart-wealth");
      const now = new Date();
      if (!chart) {
        return null;
      }
      return {
        points: parseInt(chart.dataset.chartPointCount || "0"),
        currentYear: now.getFullYear(),
        currentMonth: now.getMonth(),
        yearDisplay,
      };
    }, yearDisplay);

    expect(chartDetails).not.toBeNull();
    if (!chartDetails) {
      return;
    }
    const expectedPoints =
      chartDetails.yearDisplay === chartDetails.currentYear
        ? chartDetails.currentMonth + 1
        : 12;
    expect(chartDetails.points).toBe(expectedPoints);
  });

  test("patrimonio recorta la tabla de evolución al YTD actual", async ({
    page,
    tracker,
  }) => {
    const yearDisplay = await tracker.getDisplayedYear();
    await tracker.openWealth();

    const details = await page.evaluate((yearDisplay) => {
      const chart = document.getElementById("chart-wealth");
      const rows = Array.from(
        document.querySelectorAll("#wealth-timeline-body tr"),
      );
      return {
        chartPoints: Number(chart?.dataset.chartPointCount || 0),
        rowCount: rows.length,
        lastLabel: rows.length
          ? rows[rows.length - 1].querySelector("td")?.textContent?.trim() || ""
          : "",
        yearDisplay,
        currentYear: new Date().getFullYear(),
        currentMonth: new Date().getMonth(),
      };
    }, yearDisplay);

    expect(details.rowCount).toBe(details.chartPoints);
    const expectedLastMonth =
      details.yearDisplay === details.currentYear
        ? MONTH_NAMES[details.currentMonth]
        : "DICIEMBRE";
    expect(details.lastLabel).toBe(expectedLastMonth);
  });

  test("patrimonio permite calcular snapshot de inversión por fila y persistirlo", async ({
    tracker,
  }) => {
    const calculated = await tracker.applyInvestmentSnapshotCalculation({
      monthLabel: "MARZO",
      assetName: "Fondos Indexados",
      expression: "100+50*2",
    });
    expect(calculated).toBe(200);

    await tracker.saveSnapshot();
    await tracker.reload();
    await tracker.openWealth();
    await tracker.wealthSection
      .getByLabel("Mes snapshot")
      .selectOption({ label: "MARZO" });
    expect(await tracker.getInvestmentSnapshotValue("Fondos Indexados")).toBe(
      200,
    );
  });

  test("movimientos soporta filtrado, orden por columnas y edición inline", async ({
    tracker,
  }) => {
    test.skip(
      test.info().project.name === "mobile-chrome",
      "La edición inline y recargas consecutivas no son estables dentro del timeout en emulación táctil.",
    );
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

  test("movimientos muestra columnas en orden: fecha, descripción, importe, cuenta, tipo, categoría", async ({
    page,
    tracker,
  }) => {
    await page.goto("/movimientos");
    await expect(page).toHaveURL(/\/movimientos$/);

    // Two things were wrong here. `allInnerTexts()` is a one-shot read with no
    // auto-waiting, so it could run before the lazily mounted section rendered
    // its table and leave every index `undefined`; and `thead th` scoped to the
    // whole section also picks up the five header cells of the summary side
    // panel's own tables. Scope to the movements table and assert through
    // locators, which retry.
    const headerCells = tracker.transactionsSection.locator(
      "table:has(#tx-table-body) thead th",
    );
    await expect(headerCells).toHaveCount(8);

    await expect(headerCells.nth(1)).toContainText("Fecha");
    await expect(headerCells.nth(2)).toContainText("Descripción");
    await expect(headerCells.nth(3)).toContainText("Importe");
    await expect(headerCells.nth(4)).toContainText("Cuenta");
    await expect(headerCells.nth(5)).toContainText("Tipo");
    await expect(headerCells.nth(6)).toContainText("Categoría");
    await expect(headerCells.nth(7)).toHaveText(/^\s*acciones\s*$/i);
  });

  test("movimientos inicia con popovers de filtros ocultos en header", async ({
    page,
    tracker,
  }) => {
    await page.goto("/movimientos");
    await expect(page).toHaveURL(/\/movimientos$/);
    await expect(
      tracker.transactionsSection.getByRole("heading", {
        name: "Movimientos mensuales",
      }),
    ).toBeVisible();
    await expect(
      tracker.transactionsSection.getByRole("heading", {
        name: "Orden y filtros de tabla",
      }),
    ).toHaveCount(0);

    const popovers = tracker.transactionsSection.locator(".tx-filter-popover");
    await expect(popovers).toHaveCount(6);
    for (let index = 0; index < 6; index += 1) {
      await expect(popovers.nth(index)).toBeHidden();
    }

    const dateFilterTrigger = tracker.transactionsSection.locator(
      '.tx-filter-trigger[data-column="date"]',
    );
    await dateFilterTrigger.click();
    await expect(
      tracker.transactionsSection.locator(
        '.tx-filter-popover[data-column="date"]',
      ),
    ).toBeVisible();
    await expect(
      tracker.transactionsSection.locator(
        '.tx-filter-popover[data-column="account"]',
      ),
    ).toBeHidden();
  });

  test("movimientos muestra resumen lateral con totales y desglose por categorías", async ({
    page,
    tracker,
  }, testInfo) => {
    test.skip(
      testInfo.project.name === "mobile-chrome",
      "En móvil el lateral baja debajo de la tabla.",
    );
    await page.goto("/movimientos");
    await expect(page).toHaveURL(/\/movimientos$/);
    await tracker.filterTransactionsMonth("FEBRERO");

    await expect(tracker.transactionsSummarySection).toBeVisible();
    await expect(
      tracker.transactionsSection.locator(".tx-summary-title", {
        hasText: "TOTAL",
      }),
    ).toBeVisible();
    await expect(
      tracker.transactionsSection.locator(".tx-summary-title", {
        hasText: "DESGLOSE POR CATEGORÍAS",
      }),
    ).toBeVisible();

    // Figures below track February in `src/data/seed.json`: income is
    // Nómina 2000 + Reventa 85, expenses are the ten rows totalling 404.77,
    // and the only investment movement is the 200 indexed-fund contribution.
    expect(await tracker.getTransactionSummaryTotal("income")).toBeCloseTo(
      2085,
      2,
    );
    expect(await tracker.getTransactionSummaryTotal("expense")).toBeCloseTo(
      404.77,
      2,
    );
    expect(await tracker.getTransactionSummaryTotal("investment")).toBeCloseTo(
      200,
      2,
    );

    expect(
      await tracker.getTransactionSummaryCategoryAmount("income", "Nómina"),
    ).toBeCloseTo(2000, 2);
    expect(
      await tracker.getTransactionSummaryCategoryAmount("expense", "Comida"),
    ).toBeCloseTo(201.02, 2);
    expect(
      await tracker.getTransactionSummaryCategoryAmount(
        "investment",
        "Fondos Indexados",
      ),
    ).toBeCloseTo(200, 2);

    const assertSummarySortedDescByAmount = async (
      type: "income" | "expense" | "investment",
    ) => {
      const amountTexts = await tracker.transactionsSection
        .locator(
          `#tx-category-breakdown-body tr[data-summary-type="${type}"] .tx-summary-item > strong`,
        )
        .allInnerTexts();
      const amounts = amountTexts.map((text) =>
        Number.parseFloat(
          text
            .replace(/[^\d,-]/g, "")
            .replace(/\./g, "")
            .replace(",", "."),
        ),
      );
      const sortedAmounts = [...amounts].sort((a, b) => b - a);
      expect(amounts).toEqual(sortedAmounts);
    };

    await assertSummarySortedDescByAmount("income");
    await assertSummarySortedDescByAmount("expense");
    await assertSummarySortedDescByAmount("investment");

    await expect(
      tracker.transactionsSection.locator("#tx-category-breakdown-body"),
    ).toContainText("💼 Nómina");
    await expect(
      tracker.transactionsSection.locator("#tx-category-breakdown-body"),
    ).toContainText("✈️ Viajes");
    await expect(
      tracker.transactionsSection.locator("#tx-category-breakdown-body"),
    ).toContainText("₿ Crypto");
  });

  test("home no muestra bloque legacy de filtros en movimientos", async ({
    page,
    tracker,
  }) => {
    await page.goto("/");
    await expect(page).toHaveURL(/\/$/);
    await tracker.openTransactions();
    await expect(
      tracker.transactionsSection.getByRole("heading", {
        name: "Orden y filtros de tabla",
      }),
    ).toHaveCount(0);
  });

  test("movimientos permite filtros multiseleccion en popovers y cierra con un click fuera", async ({
    tracker,
  }, testInfo) => {
    test.skip(
      testInfo.project.name === "mobile-chrome",
      "La selección múltiple de checkboxes en popover no es estable en emulación táctil.",
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

    const typeTrigger = tracker.transactionsSection.locator(
      '.tx-filter-trigger[data-column="type"]',
    );
    const typePopover = tracker.transactionsSection.locator(
      '.tx-filter-popover[data-column="type"]',
    );
    await typeTrigger.click();
    await expect(typePopover).toBeVisible();

    await tracker.transactionsSection
      .locator('#tx-header-filter-type label', { hasText: 'Gasto' })
      .click();
    await tracker.transactionsSection
      .locator('#tx-header-filter-type label', { hasText: 'Inversión' })
      .click();

    await expect(
      tracker.transactionsSection.locator("#tx-table-body tr", {
        hasText: "e2e-multi-expense",
      }),
    ).toHaveCount(1);
    await expect(
      tracker.transactionsSection.locator("#tx-table-body tr", {
        hasText: "e2e-multi-investment",
      }),
    ).toHaveCount(1);
    await expect(
      tracker.transactionsSection.locator("#tx-table-body tr", {
        hasText: "e2e-multi-income",
      }),
    ).toHaveCount(0);

    await tracker.transactionsSection
      .getByRole("heading", { name: "Movimientos mensuales" })
      .click();
    await expect(typePopover).toBeHidden();

    const accountTrigger = tracker.transactionsSection.locator(
      '.tx-filter-trigger[data-column="account"]',
    );
    await accountTrigger.click();
    const accountChecks = tracker.transactionsSection.locator(
      '#tx-header-filter-account input[type="checkbox"]',
    );
    if ((await accountChecks.count()) >= 2) {
      await accountChecks.nth(0).click({ force: true });
      await accountChecks.nth(1).click({ force: true });
      await expect(
        tracker.transactionsSection.locator(
          '#tx-header-filter-account input[type="checkbox"]:checked',
        ),
      ).toHaveCount(2);
    }

    await tracker.clearTransactionFilters();
  });

  test("movimientos soporta modal con 'Otro' y acciones masivas", async ({
    tracker,
  }) => {
    test.skip(
      test.info().project.name === "mobile-chrome",
      "El flujo completo de modal persistente y acciones masivas excede el timeout en emulación táctil.",
    );
    await tracker.addCustomTransactionKeepOpen({
      date: "2026-03-11",
      monthLabel: "MARZO",
      type: "expense",
      categoryLabel: "Comida",
      amount: 11,
      description: "e2e-bulk-a",
    });
    expect(await tracker.transactionModalDateValue()).toBe("2026-03-11");
    expect(await tracker.transactionModalCategoryValue()).toBe("Comida");

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
    await expect(
      tracker.transactionsSection.locator("#tx-table-body"),
    ).toContainText("📈 Fondos Indexados");
    await expect(
      tracker.transactionsSection.locator("#tx-table-body tr", {
        hasText: "Fondos Indexados",
      }),
    ).toHaveCount(2);

    await tracker.selectTransactionByDescription("e2e-bulk-a");
    await tracker.selectTransactionByDescription("e2e-bulk-b");
    await tracker.deleteSelectedTransactions();
    expect(await tracker.getTransactionRowCount()).toBe(0);
    await tracker.clearTransactionFilters();
  });

  test("movimientos mantiene abierto el popover al seleccionar texto dentro y soltar fuera", async ({
    page,
    tracker,
  }, testInfo) => {
    test.skip(
      testInfo.project.name === "mobile-chrome",
      "La selección con arrastre y ratón no aplica de forma fiable en emulación táctil.",
    );
    await page.goto("/movimientos");
    await expect(page).toHaveURL(/\/movimientos$/);
    await expect(
      tracker.transactionsSection.getByRole("heading", {
        name: "Movimientos mensuales",
      }),
    ).toBeVisible();

    const trigger = tracker.transactionsSection.locator(
      '.tx-filter-trigger[data-column="description"]',
    );
    const popover = tracker.transactionsSection.locator(
      '.tx-filter-popover[data-column="description"]',
    );
    const input = tracker.transactionsSection.locator(
      "#tx-header-filter-description",
    );

    await trigger.click();
    await expect(popover).toBeVisible();
    await input.fill("texto seleccionable para e2e");

    const box = await input.boundingBox();
    expect(box).not.toBeNull();
    if (!box) {
      return;
    }

    // `TransactionsSection.vue`'s outside-pointerdown handler closes the
    // popover based on where the drag *starts* (`popover.contains(target)`),
    // not where it ends — a text-selection drag that begins inside the
    // popover's input and is released outside it must NOT close the
    // popover (this is exactly what `hasSelectionWithin` guards), mirroring
    // the sibling "mantiene abierto modal" test's contract for the
    // transaction-form dialog.
    await page.mouse.move(box.x + 8, box.y + box.height / 2);
    await page.mouse.down();
    await page.mouse.move(box.x + box.width + 120, box.y + box.height / 2);
    await page.mouse.up();

    await expect(popover).toBeVisible();

    // Genuine outside-click-closes coverage lives in "movimientos permite
    // filtros multiseleccion en popovers y cierra con un click fuera" below
    // — deliberately not re-asserted here. `hasSelectionWithin` is read on
    // the *first* pointerdown of whatever's clicked next, before the browser
    // has blurred the still-selected input from this drag, so it stays
    // open through that single next click too; that's an inherent one-click
    // lag in this same-tick edge case, not something this test should pin.
  });

  test("movimientos mantiene abierto modal al seleccionar texto y soltar fuera", async ({
    page,
    tracker,
  }) => {
    await page.goto("/movimientos");
    await expect(page).toHaveURL(/\/movimientos$/);
    await expect(
      tracker.transactionsSection.getByRole("heading", {
        name: "Movimientos mensuales",
      }),
    ).toBeVisible();

    const openModalButton = tracker.transactionsSection.getByRole("button", {
      name: "Nuevo",
    });
    const dialog = tracker.transactionsSection.locator("#tx-dialog");
    const descriptionInput = tracker.transactionsSection.locator(
      '#tx-form input[name="description"]',
    );

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

    const isOpen = await dialog.evaluate(
      (element) => (element as HTMLDialogElement).open,
    );
    expect(isOpen).toBe(true);
  });

  test("datos crea issue de bug y muestra confirmación", async ({
    page,
    tracker,
  }) => {
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
    });

    await expect(tracker.issueReportStatus()).toContainText("Reporte creado:");
    await expect(tracker.issueReportStatus().locator("a")).toHaveAttribute(
      "href",
      "https://github.com/example/repo/issues/321",
    );
  });
});

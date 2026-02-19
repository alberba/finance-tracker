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
  });

  test("renderiza dashboard con KPIs", async ({ tracker }) => {
    await tracker.openDashboard();
    const incomeText = await tracker.dashboardIncomeText();
    expect(incomeText).toContain("€");
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
});

import { expect, type Locator, type Page } from "@playwright/test";

const SECTION_CONFIG = {
  dashboard: { buttonLabel: "Dashboard", headingText: "Resumen financiero" },
  transactions: {
    buttonLabel: "Movimientos",
    headingText: "Movimientos mensuales",
  },
  budget: { buttonLabel: "Presupuesto", headingText: "Presupuesto" },
  wealth: { buttonLabel: "Patrimonio", headingText: "Patrimonio total" },
  investment: { buttonLabel: "Inversión", headingText: "Inversión y aportes" },
  goals: { buttonLabel: "Objetivos", headingText: "Objetivos" },
  settings: { buttonLabel: "Configuración", headingText: "Configuración base" },
  data: { buttonLabel: "Datos", headingText: "Datos y backups" },
} as const;

export type FinanceSectionId = keyof typeof SECTION_CONFIG;

export class FinanceTrackerPage {
  constructor(private readonly page: Page) {}

  get dashboardSection(): Locator {
    return this.page.locator("#dashboard");
  }

  get transactionsSection(): Locator {
    return this.page.locator("#transactions");
  }

  get transactionsSummarySection(): Locator {
    return this.transactionsSection.locator(".tx-summary-side");
  }

  get budgetSection(): Locator {
    return this.page.locator("#budget");
  }

  get wealthSection(): Locator {
    return this.page.locator("#wealth");
  }

  get dataSection(): Locator {
    return this.page.locator("#data");
  }

  get issueReportDialog(): Locator {
    return this.page.locator("#global-report-dialog");
  }

  async goto() {
    await this.page.goto("/");
    await expect(
      this.page.locator('html[data-finance-ready="true"]'),
    ).toBeVisible();
    await expect(
      this.dashboardSection.getByRole("heading", {
        name: "Resumen financiero",
      }),
    ).toBeVisible();
  }

  async openDashboard() {
    await this.open("dashboard");
  }

  async openTransactions() {
    await this.open("transactions");
  }

  async openSubscriptionsTab() {
    await this.openTransactions();
    await this.transactionsSection
      .getByRole("tab", { name: "Suscripciones" })
      .click();
  }

  async addSubscription(params: {
    name: string;
    amount: number;
    categoryLabel: string;
    frequency: "weekly" | "monthly" | "quarterly" | "yearly";
    firstChargeDate: string;
  }) {
    await this.openSubscriptionsTab();
    const section = this.transactionsSection.locator(
      "#transactions-tab-subscriptions",
    );
    await section.getByLabel("Nombre").fill(params.name);
    await section.getByLabel("Importe").fill(String(params.amount));
    await this.selectByLabelOrFirst(
      section.getByLabel("Cuenta"),
      "Revolut",
    );
    await this.selectByLabelOrFirst(
      section.getByLabel("Categoría"),
      params.categoryLabel,
    );
    await section.getByLabel("Frecuencia").selectOption(params.frequency);
    await section.getByLabel("Primer cobro").fill(params.firstChargeDate);
    await section.getByRole("button", { name: "Añadir suscripción" }).click();
  }

  async openBudget() {
    await this.open("budget");
  }

  async openWealth() {
    await this.open("wealth");
  }

  async openInvestment() {
    await this.open("investment");
  }

  async openInvestmentDashboardTab() {
    await this.openInvestment();
    await this.investmentSection()
      .getByRole("tab", { name: "Dashboard" })
      .click();
  }

  async openInvestmentMovementsTab() {
    await this.openInvestment();
    await this.investmentSection()
      .getByRole("tab", { name: "Movimientos" })
      .click();
  }

  async openInvestmentContributionsTab() {
    await this.openInvestment();
    await this.investmentSection()
      .getByRole("tab", { name: "Aportes" })
      .click();
  }

  async openInvestmentRecurringTab() {
    await this.openInvestment();
    await this.investmentSection()
      .getByRole("tab", { name: "Compras recurrentes" })
      .click();
  }

  async openGoals() {
    await this.open("goals");
  }

  async openSettings() {
    await this.open("settings");
  }

  async openData() {
    await this.open("data");
  }

  async openGlobalReportDialog() {
    await this.page.locator("#global-report-trigger").click();
    await expect(this.issueReportDialog).toBeVisible();
  }

  async submitIssueReport(params: {
    // Only the two options `#issue-report-type` actually renders. The wider
    // `ReportType` in `src/services/issue-report-api.ts` still allows
    // "enhancement", but the UI dropped it, so asking for it here just made
    // `selectOption` hang until the test timed out.
    type: "bug" | "feature";
    summary: string;
    description: string;
    expectedResult?: string;
    actualResult?: string;
  }) {
    await this.openGlobalReportDialog();
    const form = this.issueReportDialog.locator("#issue-report-form");
    await form.locator("#issue-report-type").selectOption(params.type);
    await form.locator("#issue-report-summary").fill(params.summary);
    await form.locator("#issue-report-description").fill(params.description);
    if (params.expectedResult !== undefined) {
      await form.locator("#issue-report-expected").fill(params.expectedResult);
    }
    if (params.actualResult !== undefined) {
      await form.locator("#issue-report-actual").fill(params.actualResult);
    }
    await form.getByRole("button", { name: "Crear reporte" }).click();
  }

  issueReportStatus(): Locator {
    return this.issueReportDialog.locator("#issue-report-status");
  }

  async open(sectionId: FinanceSectionId) {
    const sectionConfig = SECTION_CONFIG[sectionId];
    await this.openSection(
      sectionConfig.buttonLabel,
      sectionId,
      sectionConfig.headingText,
    );
  }

  section(sectionId: FinanceSectionId): Locator {
    return this.page.locator(`#${sectionId}`);
  }

  async setDashboardMonth(monthLabel: string) {
    await this.openDashboard();
    await this.dashboardSection
      .getByLabel("Mes")
      .selectOption({ label: monthLabel });
  }

  async addIncomeTransaction(params: {
    date: string;
    monthLabel: string;
    categoryLabel: string;
    amount: number;
    description: string;
  }) {
    await this.openTransactions();
    await this.ensureTransactionModalOpen();

    const form = this.transactionsSection.locator("#tx-form");
    await form.getByLabel("Fecha").fill(params.date);
    await form.getByLabel("Mes").selectOption({ label: params.monthLabel });
    await form.getByLabel("Tipo").selectOption("income");
    await this.selectByLabelOrFirst(form.getByLabel("Cuenta"), "Revolut");
    await this.selectByLabelOrFirst(
      form.getByLabel("Categoría"),
      params.categoryLabel,
    );
    await form.getByLabel("Descripción").fill(params.description);
    await form.getByLabel("Importe").fill(String(params.amount));

    await form.getByRole("button", { name: "Guardar" }).click();
    await expect(this.page.getByRole("status")).toContainText(
      "Movimiento guardado.",
    );
  }

  async addCustomTransaction(params: {
    date: string;
    monthLabel: string;
    type: "income" | "expense" | "investment";
    categoryLabel: string;
    amount: number;
    description: string;
    /**
     * WP10 fix: defaults to the pre-seeded "Revolut" account (unchanged
     * behavior for every other call site), but `offline-sync.spec.ts`'s
     * sync-v2 conflict test must pass the name of an account it created
     * itself in this session — a *seeded* account has no v2 `account` row
     * (never went through a `create` sync command), so
     * `resolveEntityId('account', …)` can never resolve it and any
     * transaction referencing it is silently never sync-created at all
     * (see `command-mapping.ts`'s `syncListDiff`/`buildTransactionData`).
     */
    accountLabel?: string;
  }) {
    await this.openTransactions();
    await this.ensureTransactionModalOpen();
    const form = this.transactionsSection.locator("#tx-form");
    await form.getByLabel("Fecha").fill(params.date);
    await form.getByLabel("Mes").selectOption({ label: params.monthLabel });
    await form.getByLabel("Tipo").selectOption(params.type);
    await this.selectByLabelOrFirst(form.getByLabel("Cuenta"), params.accountLabel ?? "Revolut");
    await this.selectByLabelOrFirst(
      form.getByLabel("Categoría"),
      params.categoryLabel,
    );
    await form.getByLabel("Descripción").fill(params.description);
    await form.getByLabel("Importe").fill(String(params.amount));
    await form.getByRole("button", { name: "Guardar" }).click();
    await expect(this.page.getByRole("status")).toContainText(
      "Movimiento guardado.",
    );
  }

  async addCustomTransactionKeepOpen(params: {
    date: string;
    monthLabel: string;
    type: "income" | "expense" | "investment";
    categoryLabel: string;
    amount: number;
    description: string;
  }) {
    await this.openTransactions();
    await this.ensureTransactionModalOpen();
    const form = this.transactionsSection.locator("#tx-form");
    await form.getByLabel("Fecha").fill(params.date);
    await form.getByLabel("Mes").selectOption({ label: params.monthLabel });
    await form.getByLabel("Tipo").selectOption(params.type);
    await this.selectByLabelOrFirst(form.getByLabel("Cuenta"), "Revolut");
    await this.selectByLabelOrFirst(
      form.getByLabel("Categoría"),
      params.categoryLabel,
    );
    await form.getByLabel("Descripción").fill(params.description);
    await form.getByLabel("Importe").fill(String(params.amount));
    await form.getByRole("button", { name: "Otro" }).click();
    await expect(this.page.getByRole("status")).toContainText(
      "Guardado. Puedes añadir otro.",
    );
  }

  async addInvestmentMovement(params: {
    date: string;
    time: string;
    side: "buy" | "sell";
    symbol: string;
    category?: string;
    unitPrice: number;
    units: number;
    fee: number;
    movementCurrency?: string;
    brokerName?: string;
    declared?: boolean;
  }) {
    await this.openInvestmentMovementsTab();
    const section = this.investmentSection();
    await section.locator("#investment-movement-date").fill(params.date);
    await section.locator("#investment-movement-time").fill(params.time);
    await section
      .locator("#investment-movement-side")
      .selectOption(params.side);
    await section.locator("#investment-movement-symbol").fill(params.symbol);
    if (params.category !== undefined) {
      const categorySelect = section.locator("#investment-movement-category");
      if (!(await categorySelect.isDisabled())) {
        await this.selectByLabelOrFirst(categorySelect, params.category);
      }
    }
    await section
      .locator("#investment-movement-unit-price")
      .fill(String(params.unitPrice));
    await section
      .locator("#investment-movement-units")
      .fill(String(params.units));
    await section.locator("#investment-movement-fee").fill(String(params.fee));
    if (params.movementCurrency) {
      await section
        .locator("#investment-movement-currency")
        .fill(params.movementCurrency);
    }
    await this.selectByLabelOrFirst(
      section.locator("#investment-movement-broker"),
      params.brokerName || "Revolut",
    );

    const declaredInput = section.locator("#investment-movement-declared");
    if (params.declared) {
      await declaredInput.check();
    } else {
      await declaredInput.uncheck();
    }

    await section.getByRole("button", { name: "Guardar movimiento" }).click();
    await expect(this.page.getByRole("status")).toContainText(
      "Movimiento de inversión guardado.",
    );
  }

  async addAccount(params: { name: string; openingBalance?: number }) {
    await this.openSettings();
    const form = this.page.locator("#add-account-form");
    await form.locator('input[name="name"]').fill(params.name);
    await form
      .locator('input[name="openingBalance"]')
      .fill(String(params.openingBalance ?? 0));
    await form.getByRole("button", { name: "Agregar" }).click();
    await expect(this.page.getByRole("status")).toContainText(
      "Elemento agregado.",
    );
  }

  async setTwrLiquidityAccountEnabled(accountName: string, enabled: boolean) {
    await this.openSettings();
    const row = this.page
      .locator("#settings-twr-liquidity label", { hasText: accountName })
      .first();
    await expect(row).toBeVisible();
    const checkbox = row.locator('input[type="checkbox"]');
    if (enabled) {
      await checkbox.check();
    } else {
      await checkbox.uncheck();
    }
    await expect(this.page.getByRole("status")).toContainText(
      "Configuración TWR actualizada.",
    );
  }

  async transactionModalDateValue(): Promise<string> {
    await this.openTransactions();
    await this.ensureTransactionModalOpen();
    return this.transactionsSection
      .locator('#tx-form input[name="date"]')
      .inputValue();
  }

  async transactionModalCategoryValue(): Promise<string> {
    await this.openTransactions();
    await this.ensureTransactionModalOpen();
    return this.transactionsSection
      .locator('#tx-form select[name="category"]')
      .inputValue();
  }

  async selectTransactionByDescription(description: string) {
    await this.openTransactions();
    const row = this.transactionsSection
      .locator("#tx-table-body tr", { hasText: description })
      .first();
    await expect(row).toBeVisible();
    await row.locator("input[data-select-tx-id]").check();
  }

  async applyBulkTransactionChanges(params: {
    type?: "income" | "expense" | "investment";
    accountName?: string;
    category?: string;
  }) {
    await this.openTransactions();
    if (params.type) {
      await this.transactionsSection
        .locator("#tx-bulk-type")
        .selectOption(params.type);
    }
    if (params.accountName) {
      await this.selectByLabelOrFirst(
        this.transactionsSection.locator("#tx-bulk-account"),
        params.accountName,
      );
    }
    if (params.category !== undefined) {
      await this.transactionsSection
        .locator("#tx-bulk-category")
        .fill(params.category);
    }
    await this.transactionsSection.locator("#tx-bulk-apply").click();
  }

  async deleteSelectedTransactions() {
    await this.openTransactions();
    await this.transactionsSection.locator("#tx-bulk-delete").click();
  }

  async filterTransactionsMonth(monthLabel: string) {
    await this.openTransactions();
    await this.transactionsSection
      .getByLabel("Filtrar mes")
      .selectOption({ label: monthLabel });
  }

  async expectTransactionDescriptionVisible(description: string) {
    await expect(
      this.transactionsSection.locator("#tx-table-body tr", {
        hasText: description,
      }),
    ).toBeVisible();
  }

  async getTransactionRowCount(): Promise<number> {
    const emptyState = this.transactionsSection.locator("#tx-table-body tr", {
      hasText: "Sin movimientos para este mes.",
    });
    if (await emptyState.isVisible()) {
      return 0;
    }
    return this.transactionsSection.locator("#tx-table-body tr").count();
  }

  async setTransactionCategoryFilter(value: string) {
    await this.openTransactions();
    const trigger = this.transactionsSection.locator(
      '.tx-filter-trigger[data-column="category"]',
    );
    await trigger.click();
    await this.transactionsSection
      .locator("#tx-header-filter-category")
      .fill(value);
  }

  async setTransactionDescriptionFilter(value: string) {
    await this.openTransactions();
    const trigger = this.transactionsSection.locator(
      '.tx-filter-trigger[data-column="description"]',
    );
    await trigger.click();
    await this.transactionsSection
      .locator("#tx-header-filter-description")
      .fill(value);
  }

  async clearTransactionFilters() {
    await this.openTransactions();
    const clearColumns = [
      "date",
      "account",
      "type",
      "category",
      "description",
      "amount",
    ];
    for (const column of clearColumns) {
      const trigger = this.transactionsSection.locator(
        `.tx-filter-trigger[data-column="${column}"]`,
      );
      await trigger.click();
      await this.transactionsSection
        .locator(`.tx-header-clear-btn[data-column="${column}"]`)
        .click();
    }
  }

  async clickSortByDate() {
    await this.openTransactions();
    await this.transactionsSection
      .getByRole("button", { name: "Ordenar por fecha" })
      .click();
  }

  async firstTransactionDateText(): Promise<string> {
    const row = this.transactionsSection.locator("#tx-table-body tr").first();
    return (await row.locator("td").nth(1).innerText()).trim();
  }

  async editTransactionByDescription(
    description: string,
    payload: {
      amount?: number;
      category?: string;
      newDescription?: string;
      date?: string;
    },
  ) {
    await this.openTransactions();
    const row = this.transactionsSection
      .locator("#tx-table-body tr", { hasText: description })
      .first();
    await expect(row).toBeVisible();
    await row.getByRole("button", { name: "Editar" }).click();

    const editRow = this.transactionsSection
      .locator("tr[data-editing-id]")
      .first();
    await expect(editRow).toBeVisible();

    if (payload.date) {
      await editRow.locator('[data-edit-field="date"]').fill(payload.date);
    }
    if (typeof payload.amount === "number") {
      await editRow
        .locator('[data-edit-field="amount"]')
        .fill(String(payload.amount));
    }
    if (typeof payload.category === "string") {
      await this.selectByLabelOrFirst(
        editRow.locator('[data-edit-field="category"]'),
        payload.category,
      );
    }
    if (typeof payload.newDescription === "string") {
      await editRow
        .locator('[data-edit-field="description"]')
        .fill(payload.newDescription);
    }

    await editRow.getByRole("button", { name: "Guardar" }).click();
    await expect(this.page.getByRole("status")).toContainText(
      "Movimiento actualizado.",
    );
  }

  async setBudgetValue(params: {
    typeValue: "income" | "expense" | "investment";
    monthLabel: string;
    categoryLabel: string;
    plannedValue: number;
  }) {
    await this.openBudget();
    const monthIndex = [
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
    ].indexOf(params.monthLabel);
    const block = this.budgetSection.locator(
      `[data-budget-type="${params.typeValue}"]`,
    );
    const row = block.locator("tbody tr", {
      hasText: params.categoryLabel,
    });
    await expect(row).toBeVisible();
    const input = row.locator(
      `input[data-category="${params.categoryLabel}"][data-type="${params.typeValue}"][data-month="${monthIndex}"]`,
    );
    await input.fill(String(params.plannedValue));
  }

  async getBudgetValue(params: {
    typeValue: "income" | "expense" | "investment";
    monthLabel: string;
    categoryLabel: string;
  }): Promise<number> {
    const monthIndex = [
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
    ].indexOf(params.monthLabel);
    const block = this.budgetSection.locator(
      `[data-budget-type="${params.typeValue}"]`,
    );
    const row = block.locator("tbody tr", { hasText: params.categoryLabel });
    const input = row.locator(
      `input[data-category="${params.categoryLabel}"][data-type="${params.typeValue}"][data-month="${monthIndex}"]`,
    );
    const value = await input.inputValue();
    return Number(value);
  }

  async saveAccountSnapshot(params: {
    monthLabel: string;
    accountName: string;
    value: number;
  }) {
    await this.openWealth();
    await this.wealthSection
      .getByLabel("Mes snapshot")
      .selectOption({ label: params.monthLabel });

    const row = this.wealthSection.locator(
      `#snapshot-accounts tr:has(td:text-is("${params.accountName}"))`,
    );
    await expect(row).toBeVisible();

    const input = row.locator('input[data-snapshot-kind="accounts"]');
    await input.fill(String(params.value));
    await this.wealthSection
      .getByRole("button", { name: "Guardar snapshot" })
      .click();
    await expect(this.page.getByRole("status")).toContainText(
      "Snapshot guardado.",
    );
  }

  async getAccountSnapshotValue(accountName: string): Promise<number> {
    const row = this.wealthSection.locator(
      `#snapshot-accounts tr:has(td:text-is("${accountName}"))`,
    );
    const input = row.locator('input[data-snapshot-kind="accounts"]');
    const value = await input.inputValue();
    return Number(value);
  }

  async applyInvestmentSnapshotCalculation(params: {
    monthLabel: string;
    assetName: string;
    expression: string;
  }): Promise<number> {
    await this.openWealth();
    await this.wealthSection
      .getByLabel("Mes snapshot")
      .selectOption({ label: params.monthLabel });
    const row = this.wealthSection.locator(
      `#snapshot-investments tr:has(td:text-is("${params.assetName}"))`,
    );
    await expect(row).toBeVisible();
    await row
      .getByRole("button", { name: `Abrir cálculo de ${params.assetName}` })
      .click();

    const modal = this.page.locator("#wealth-calc-dialog");
    await expect(modal).toBeVisible();
    await modal.getByLabel("Cálculo numérico").fill(params.expression);
    await modal.getByRole("button", { name: "Aplicar al snapshot" }).click();
    await expect(modal).toBeHidden();

    const snapshotValue = await row
      .locator('input[data-snapshot-kind="investments"]')
      .inputValue();
    return Number(snapshotValue);
  }

  async saveSnapshot() {
    await this.openWealth();
    await this.wealthSection
      .getByRole("button", { name: "Guardar snapshot" })
      .click();
    await expect(this.page.getByRole("status")).toContainText(
      "Snapshot guardado.",
    );
  }

  async getInvestmentSnapshotValue(assetName: string): Promise<number> {
    const row = this.wealthSection.locator(
      `#snapshot-investments tr:has(td:text-is("${assetName}"))`,
    );
    const input = row.locator('input[data-snapshot-kind="investments"]');
    const value = await input.inputValue();
    return Number(value);
  }

  async getTransactionSummaryTotal(
    type: "income" | "expense" | "investment",
  ): Promise<number> {
    await this.openTransactions();
    const selector =
      type === "income"
        ? "#tx-total-income"
        : type === "expense"
          ? "#tx-total-expense"
          : "#tx-total-investment";
    const text = (
      await this.transactionsSection.locator(selector).innerText()
    ).trim();
    return this.parseMoneyText(text);
  }

  async getTransactionSummaryCategoryAmount(
    column: "income" | "expense" | "investment",
    category: string,
  ): Promise<number> {
    await this.openTransactions();
    const row = this.transactionsSection.locator(
      `#tx-category-breakdown-body tr[data-summary-type="${column}"][data-summary-category="${category}"]`,
    );
    if ((await row.count()) === 0) {
      throw new Error(
        `No se encontró la categoría ${category} en la columna ${column}.`,
      );
    }
    const amountText = (
      await row.first().locator(".tx-summary-item > strong").innerText()
    ).trim();
    return this.parseMoneyText(amountText);
  }

  async dashboardIncomeText(): Promise<string> {
    return this.dashboardSection.locator("#kpi-income").innerText();
  }

  /**
   * Year currently selected in the dashboard period controls.
   *
   * `#year-display` only exists inside the dashboard section, and sections are
   * rendered one at a time, so this must be read *before* navigating
   * elsewhere. Reading it from another section used to yield `null`, which a
   * `Number(... || 0)` fallback silently turned into year 0 — flipping
   * year-dependent assertions onto the wrong branch instead of failing.
   */
  async getDisplayedYear(): Promise<number> {
    await this.openDashboard();
    const value = await this.dashboardSection
      .locator("#year-display")
      .inputValue();
    const year = Number(value);
    if (!Number.isInteger(year) || year <= 0) {
      throw new Error(`#year-display returned an unusable year: "${value}"`);
    }
    return year;
  }

  async editInvestmentMovementBySymbol(
    symbol: string,
    payload: {
      date?: string;
      time?: string;
      side?: "buy" | "sell";
      newSymbol?: string;
      category?: string;
      unitPrice?: number;
      units?: number;
      fee?: number;
      movementCurrency?: string;
      declared?: boolean;
    },
  ) {
    await this.openInvestmentMovementsTab();
    const row = this.investmentSection()
      .locator("#investment-tx-table-body tr", { hasText: symbol })
      .first();
    await expect(row).toBeVisible();
    await row.getByRole("button", { name: "Editar" }).click();

    const editRow = this.investmentSection()
      .locator("tr[data-investment-editing-id]")
      .first();
    await expect(editRow).toBeVisible();

    if (payload.date) {
      await editRow.locator('[data-edit-field="date"]').fill(payload.date);
    }
    if (payload.time) {
      await editRow.locator('[data-edit-field="time"]').fill(payload.time);
    }
    if (payload.side) {
      await editRow
        .locator('[data-edit-field="side"]')
        .selectOption(payload.side);
    }
    if (typeof payload.newSymbol === "string") {
      await editRow
        .locator('[data-edit-field="symbol"]')
        .fill(payload.newSymbol);
    }
    if (typeof payload.category === "string") {
      await this.selectByLabelOrFirst(
        editRow.locator('[data-edit-field="category"]'),
        payload.category,
      );
    }
    if (typeof payload.unitPrice === "number") {
      await editRow
        .locator('[data-edit-field="unitPrice"]')
        .fill(String(payload.unitPrice));
    }
    if (typeof payload.units === "number") {
      await editRow
        .locator('[data-edit-field="units"]')
        .fill(String(payload.units));
    }
    if (typeof payload.fee === "number") {
      await editRow
        .locator('[data-edit-field="fee"]')
        .fill(String(payload.fee));
    }
    if (typeof payload.movementCurrency === "string") {
      await editRow
        .locator('[data-edit-field="movementCurrency"]')
        .fill(payload.movementCurrency);
    }
    if (typeof payload.declared === "boolean") {
      const checkbox = editRow.locator('[data-edit-field="declared"]');
      if (payload.declared) {
        await checkbox.check();
      } else {
        await checkbox.uncheck();
      }
    }

    await editRow.getByRole("button", { name: "Guardar" }).click();
    await expect(this.page.getByRole("status")).toContainText(
      "Movimiento de inversión actualizado.",
    );
  }

  async expectInvestmentMovementCategory(symbol: string, category: string) {
    await this.openInvestmentMovementsTab();
    const row = this.investmentSection()
      .locator("#investment-tx-table-body tr", { hasText: symbol })
      .first();
    await expect(row).toBeVisible();
    await expect(row).toContainText(category);
  }

  async deleteInvestmentMovementBySymbol(symbol: string) {
    await this.openInvestmentMovementsTab();
    const row = this.investmentSection()
      .locator("#investment-tx-table-body tr", { hasText: symbol })
      .first();
    await expect(row).toBeVisible();
    await row.getByRole("button", { name: "Eliminar" }).click();
    await expect(this.page.getByRole("status")).toContainText(
      "Movimiento eliminado.",
    );
  }

  async filterInvestmentYear(year: number) {
    await this.openInvestmentMovementsTab();
    await this.investmentSection()
      .locator("#investment-year-filter")
      .selectOption(String(year));
  }

  async setInvestmentOnlyUndeclared(enabled: boolean) {
    await this.openInvestmentMovementsTab();
    const input = this.investmentSection().locator(
      "#investment-only-undeclared",
    );
    if (enabled) {
      await input.check();
    } else {
      await input.uncheck();
    }
  }

  async setContributionFlowByDate(date: string, flow: number) {
    await this.openInvestmentContributionsTab();
    const input = this.investmentSection().locator(
      `input[data-contribution-flow-date="${date}"]`,
    );
    await expect(input).toBeVisible();
    await input.fill(String(flow));
  }

  async getContributionRowTexts(date: string): Promise<string[]> {
    await this.openInvestmentContributionsTab();
    const row = this.investmentSection()
      .locator("#contribution-body tr", { hasText: date })
      .first();
    await expect(row).toBeVisible();
    return row.locator("td").allInnerTexts();
  }

  async getContributionFlowByDate(date: string): Promise<number> {
    await this.openInvestmentContributionsTab();
    const input = this.investmentSection().locator(
      `input[data-contribution-flow-date="${date}"]`,
    );
    await expect(input).toBeVisible();
    return Number(await input.inputValue());
  }

  async openContributionWorkflowModal() {
    await this.openInvestmentContributionsTab();
    await this.investmentSection()
      .getByRole("button", { name: "Añadir aporte" })
      .click();
    await expect(
      this.page.locator("#contribution-workflow-dialog"),
    ).toBeVisible();
  }

  async contributionWorkflowSelectMonth(monthLabel: string) {
    const modal = this.page.locator("#contribution-workflow-dialog");
    await modal
      .locator("#contribution-workflow-month")
      .selectOption({ label: monthLabel });
  }

  async contributionWorkflowSetDate(date: string) {
    const modal = this.page.locator("#contribution-workflow-dialog");
    await modal.locator("#contribution-workflow-date").fill(date);
  }

  async contributionWorkflowDateValue(): Promise<string> {
    const modal = this.page.locator("#contribution-workflow-dialog");
    return modal.locator("#contribution-workflow-date").inputValue();
  }

  async contributionWorkflowSetInvestmentSnapshot(
    assetName: string,
    value: number,
  ) {
    const modal = this.page.locator("#contribution-workflow-dialog");
    const row = modal.locator("#contribution-workflow-investments-body tr", {
      hasText: assetName,
    });
    await expect(row).toBeVisible();
    await row
      .locator('input[data-contribution-snapshot-kind="investments"]')
      .fill(String(value));
  }

  async contributionWorkflowApplySnapshotCalculator(params: {
    type: "investment" | "liquidity";
    rowName: string;
    expression: string;
  }) {
    const modal = this.page.locator("#contribution-workflow-dialog");
    const tbodySelector =
      params.type === "investment"
        ? "#contribution-workflow-investments-body"
        : "#contribution-workflow-liquidity-body";
    const row = modal.locator(`${tbodySelector} tr`, {
      hasText: params.rowName,
    });
    await expect(row).toBeVisible();
    await row
      .getByRole("button", { name: `Calcular snapshot de ${params.rowName}` })
      .click();
    const calc = this.page.locator("#contribution-calc-dialog");
    await expect(calc).toHaveJSProperty("open", true);
    await calc.locator("#contribution-calc-expression").fill(params.expression);
    await calc.getByRole("button", { name: "Aplicar al snapshot" }).click();
    await expect(calc).toHaveJSProperty("open", false);
    await expect(
      this.page.locator("#contribution-workflow-dialog"),
    ).toBeVisible();
  }

  async contributionWorkflowSetLiquiditySnapshot(
    accountName: string,
    value: number,
  ) {
    const modal = this.page.locator("#contribution-workflow-dialog");
    const row = modal.locator("#contribution-workflow-liquidity-body tr", {
      hasText: accountName,
    });
    await expect(row).toBeVisible();
    await row
      .locator('input[data-contribution-snapshot-kind="accounts"]')
      .fill(String(value));
  }

  async contributionWorkflowGoToAllocationStep() {
    const modal = this.page.locator("#contribution-workflow-dialog");
    await modal.getByRole("button", { name: "Siguiente" }).click();
    await expect(
      modal.locator("#contribution-workflow-step-allocation"),
    ).toBeVisible();
  }

  async contributionWorkflowSetTotal(value: number) {
    const modal = this.page.locator("#contribution-workflow-dialog");
    await modal.locator("#contribution-workflow-total").fill(String(value));
  }

  async contributionWorkflowSetAllocation(accountName: string, value: number) {
    const modal = this.page.locator("#contribution-workflow-dialog");
    const row = modal.locator("#contribution-workflow-allocation-body tr", {
      hasText: accountName,
    });
    await expect(row).toBeVisible();
    await row
      .locator("input[data-contribution-allocation-account-id]")
      .fill(String(value));
  }

  contributionWorkflowSnapshotWarning(): Locator {
    return this.page.locator("#contribution-workflow-snapshot-warning");
  }

  contributionWorkflowAllocationWarning(): Locator {
    return this.page.locator("#contribution-workflow-allocation-warning");
  }

  async contributionWorkflowSave() {
    const modal = this.page.locator("#contribution-workflow-dialog");
    await modal
      .getByRole("button", { name: "Guardar aporte (con avisos)" })
      .click();
  }

  async contributionWorkflowPressEnterInInvestmentSnapshot(assetName: string) {
    const modal = this.page.locator("#contribution-workflow-dialog");
    const row = modal.locator("#contribution-workflow-investments-body tr", {
      hasText: assetName,
    });
    await expect(row).toBeVisible();
    await row
      .locator('input[data-contribution-snapshot-kind="investments"]')
      .press("Enter");
  }

  async deleteManualContributionByDate(date: string) {
    await this.openInvestmentContributionsTab();
    const row = this.investmentSection().locator("#contribution-body tr", {
      hasText: date,
    });
    await expect(row).toBeVisible();
    await row
      .locator(`button[data-delete-contribution-date="${date}"]`)
      .click();
    await expect(
      this.page.locator("#contribution-delete-dialog"),
    ).toBeVisible();
  }

  async confirmDeleteManualContribution() {
    const dialog = this.page.locator("#contribution-delete-dialog");
    await dialog.getByRole("button", { name: "Eliminar aporte" }).click();
  }

  async getInvestmentMovementsOperations(): Promise<string[]> {
    await this.openInvestmentMovementsTab();
    const rows = this.investmentSection().locator(
      "#investment-tx-table-body tr",
    );
    const count = await rows.count();
    const operations: string[] = [];
    for (let index = 0; index < count; index += 1) {
      const operation = (
        await rows.nth(index).locator("td").nth(2).innerText()
      ).trim();
      operations.push(operation);
    }
    return operations;
  }

  investmentSection(): Locator {
    return this.page.locator("#investment");
  }

  async reload() {
    await this.page.reload();
    await expect(
      this.page.locator('html[data-finance-ready="true"]'),
    ).toBeVisible();
    await expect(this.page.locator("[data-finance-workspace]")).toBeVisible();
  }

  private async openSection(
    buttonLabel: string,
    sectionId: string,
    headingText: string,
  ) {
    const section = this.page.locator(`#${sectionId}`);
    if (!(await section.isVisible())) {
      await this.clickNavButton(buttonLabel, sectionId);
    }
    await expect(section).toBeVisible();
    await expect(
      section.getByRole("heading", { name: headingText }),
    ).toBeVisible();
  }

  /**
   * Click the navigation entry for a section, on whichever navigation the
   * current viewport actually shows.
   *
   * `#nav-tabs` holds both the desktop sidebar and the mobile bar, so the
   * button for a section always exists in the DOM — but only one of them is
   * visible, and on mobile the secondary sections (wealth, goals, data,
   * settings) are not in the bar at all: they live inside the `Más` bottom
   * sheet. Targeting the button by accessible name alone therefore matched a
   * hidden element on mobile and waited until the test timed out. Every nav
   * button carries `data-section`, in all three places, so that is the hook.
   */
  private async clickNavButton(buttonLabel: string, sectionId: string) {
    const visibleNavButton = this.page.locator(
      `#nav-tabs [data-section="${sectionId}"]:visible`,
    );
    if ((await visibleNavButton.count()) > 0) {
      await visibleNavButton.first().click();
      return;
    }

    const moreTrigger = this.page.locator(
      "#nav-tabs [data-mobile-more-trigger]:visible",
    );
    if ((await moreTrigger.count()) === 0) {
      throw new Error(
        `No visible navigation entry for "${buttonLabel}" (${sectionId}), and no mobile "Más" trigger to open.`,
      );
    }
    await moreTrigger.first().click();
    const moreMenu = this.page.locator("#mobile-more-menu");
    await expect(moreMenu).toBeVisible();
    await moreMenu.locator(`[data-section="${sectionId}"]`).first().click();
    await expect(moreMenu).toBeHidden();
  }

  private async selectByLabelOrFirst(select: Locator, label: string) {
    const options = await select.locator("option").allTextContents();
    if (options.map((item) => item.trim()).includes(label)) {
      await select.selectOption({ label });
      return;
    }

    const firstValue = await select
      .locator("option")
      .first()
      .getAttribute("value");
    if (firstValue) {
      await select.selectOption(firstValue);
    }
  }

  private async ensureTransactionModalOpen() {
    const isOpen = await this.transactionsSection
      .locator("#tx-dialog")
      .evaluate((dialog) => {
        return (dialog as HTMLDialogElement).open;
      });
    if (!isOpen) {
      await this.transactionsSection
        .getByRole("button", { name: "Nuevo" })
        .click();
    }
  }

  private parseMoneyText(value: string): number {
    const cleaned = value
      .replace(/\u00a0/g, "")
      .replace(/[€$£]/g, "")
      .replace(/\./g, "")
      .replace(",", ".")
      .trim();
    const parsed = Number.parseFloat(cleaned);
    if (!Number.isFinite(parsed)) {
      throw new Error(`No se pudo parsear importe: ${value}`);
    }
    return parsed;
  }
}

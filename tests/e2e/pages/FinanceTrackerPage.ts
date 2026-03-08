import { expect, type Locator, type Page } from "@playwright/test";

const SECTION_CONFIG = {
  dashboard: { buttonLabel: "Dashboard", headingText: "Resumen mensual y anual" },
  transactions: { buttonLabel: "Movimientos", headingText: "Movimientos mensuales" },
  budget: { buttonLabel: "Presupuesto", headingText: "Presupuesto" },
  wealth: { buttonLabel: "Patrimonio", headingText: "Patrimonio total" },
  investment: { buttonLabel: "Inversión", headingText: "Inversión y aportes" },
  goals: { buttonLabel: "Objetivos", headingText: "Objetivos" },
  settings: { buttonLabel: "Configuración", headingText: "Configuración base" },
  data: { buttonLabel: "Datos", headingText: "Datos y backups" },
  reports: { buttonLabel: "Reportes", headingText: "Reportes y automatización" },
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

  get reportsSection(): Locator {
    return this.page.locator("#reports");
  }

  async goto() {
    await this.page.goto("/");
    await expect(this.dashboardSection.getByRole("heading", { name: "Resumen mensual y anual" })).toBeVisible();
  }

  async openDashboard() {
    await this.open("dashboard");
  }

  async openTransactions() {
    await this.open("transactions");
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
    await this.investmentSection().getByRole("tab", { name: "Dashboard" }).click();
  }

  async openInvestmentMovementsTab() {
    await this.openInvestment();
    await this.investmentSection().getByRole("tab", { name: "Movimientos" }).click();
  }

  async openInvestmentContributionsTab() {
    await this.openInvestment();
    await this.investmentSection().getByRole("tab", { name: "Aportes" }).click();
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

  async openReports() {
    await this.open("reports");
  }

  async submitIssueReport(params: {
    type: "bug" | "enhancement";
    summary: string;
    description: string;
    stepsToReproduce?: string;
    expectedResult?: string;
    actualResult?: string;
    mentionClaude?: boolean;
  }) {
    await this.openReports();
    const form = this.reportsSection.locator("#issue-report-form");
    await form.locator("#issue-report-type").selectOption(params.type);
    await form.locator("#issue-report-summary").fill(params.summary);
    await form.locator("#issue-report-description").fill(params.description);
    if (params.stepsToReproduce !== undefined) {
      await form.locator("#issue-report-steps").fill(params.stepsToReproduce);
    }
    if (params.expectedResult !== undefined) {
      await form.locator("#issue-report-expected").fill(params.expectedResult);
    }
    if (params.actualResult !== undefined) {
      await form.locator("#issue-report-actual").fill(params.actualResult);
    }
    const mention = form.locator("#issue-report-mention-claude");
    const shouldMention = params.mentionClaude ?? true;
    if (shouldMention) {
      await mention.check();
    } else {
      await mention.uncheck();
    }
    await form.getByRole("button", { name: "Crear issue" }).click();
  }

  issueReportStatus(): Locator {
    return this.reportsSection.locator("#issue-report-status");
  }

  async open(sectionId: FinanceSectionId) {
    const sectionConfig = SECTION_CONFIG[sectionId];
    await this.openSection(sectionConfig.buttonLabel, sectionId, sectionConfig.headingText);
  }

  section(sectionId: FinanceSectionId): Locator {
    return this.page.locator(`#${sectionId}`);
  }

  async setDashboardMonth(monthLabel: string) {
    await this.openDashboard();
    await this.dashboardSection.getByLabel("Mes").selectOption({ label: monthLabel });
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
    await this.selectByLabelOrFirst(form.getByLabel("Categoría"), params.categoryLabel);
    await form.getByLabel("Descripción").fill(params.description);
    await form.getByLabel("Importe").fill(String(params.amount));

    await form.getByRole("button", { name: "Guardar" }).click();
    await expect(this.page.getByRole("status")).toContainText("Movimiento guardado.");
  }

  async addCustomTransaction(params: {
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
    await this.selectByLabelOrFirst(form.getByLabel("Categoría"), params.categoryLabel);
    await form.getByLabel("Descripción").fill(params.description);
    await form.getByLabel("Importe").fill(String(params.amount));
    await form.getByRole("button", { name: "Guardar" }).click();
    await expect(this.page.getByRole("status")).toContainText("Movimiento guardado.");
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
    await this.selectByLabelOrFirst(form.getByLabel("Categoría"), params.categoryLabel);
    await form.getByLabel("Descripción").fill(params.description);
    await form.getByLabel("Importe").fill(String(params.amount));
    await form.getByRole("button", { name: "Otro" }).click();
    await expect(this.page.getByRole("status")).toContainText("Guardado. Puedes añadir otro.");
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
    await section.locator("#investment-movement-side").selectOption(params.side);
    await section.locator("#investment-movement-symbol").fill(params.symbol);
    if (params.category !== undefined) {
      const categorySelect = section.locator("#investment-movement-category");
      if (!(await categorySelect.isDisabled())) {
        await this.selectByLabelOrFirst(categorySelect, params.category);
      }
    }
    await section.locator("#investment-movement-unit-price").fill(String(params.unitPrice));
    await section.locator("#investment-movement-units").fill(String(params.units));
    await section.locator("#investment-movement-fee").fill(String(params.fee));
    if (params.movementCurrency) {
      await section.locator("#investment-movement-currency").fill(params.movementCurrency);
    }
    await this.selectByLabelOrFirst(section.locator("#investment-movement-broker"), params.brokerName || "Revolut");

    const declaredInput = section.locator("#investment-movement-declared");
    if (params.declared) {
      await declaredInput.check();
    } else {
      await declaredInput.uncheck();
    }

    await section.getByRole("button", { name: "Guardar movimiento" }).click();
    await expect(this.page.getByRole("status")).toContainText("Movimiento de inversión guardado.");
  }

  async addAccount(params: { name: string; openingBalance?: number }) {
    await this.openSettings();
    const form = this.page.locator("#add-account-form");
    await form.locator('input[name="name"]').fill(params.name);
    await form.locator('input[name="openingBalance"]').fill(String(params.openingBalance ?? 0));
    await form.getByRole("button", { name: "Agregar" }).click();
    await expect(this.page.getByRole("status")).toContainText("Elemento agregado.");
  }

  async transactionModalDateValue(): Promise<string> {
    await this.openTransactions();
    await this.ensureTransactionModalOpen();
    return this.transactionsSection.locator('#tx-form input[name="date"]').inputValue();
  }

  async selectTransactionByDescription(description: string) {
    await this.openTransactions();
    const row = this.transactionsSection.locator("#tx-table-body tr", { hasText: description }).first();
    await expect(row).toBeVisible();
    await row.locator('input[data-select-tx-id]').check();
  }

  async applyBulkTransactionChanges(params: {
    type?: "income" | "expense" | "investment";
    accountName?: string;
    category?: string;
  }) {
    await this.openTransactions();
    if (params.type) {
      await this.transactionsSection.locator("#tx-bulk-type").selectOption(params.type);
    }
    if (params.accountName) {
      await this.selectByLabelOrFirst(this.transactionsSection.locator("#tx-bulk-account"), params.accountName);
    }
    if (params.category !== undefined) {
      await this.transactionsSection.locator("#tx-bulk-category").fill(params.category);
    }
    await this.transactionsSection.locator("#tx-bulk-apply").click();
  }

  async deleteSelectedTransactions() {
    await this.openTransactions();
    await this.transactionsSection.locator("#tx-bulk-delete").click();
  }

  async filterTransactionsMonth(monthLabel: string) {
    await this.openTransactions();
    await this.transactionsSection.getByLabel("Filtrar mes").selectOption({ label: monthLabel });
  }

  async expectTransactionDescriptionVisible(description: string) {
    await expect(this.transactionsSection.locator("#tx-table-body tr", { hasText: description })).toBeVisible();
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
    const trigger = this.transactionsSection.locator('.tx-filter-trigger[data-column="category"]');
    await trigger.click();
    await this.transactionsSection.locator("#tx-header-filter-category").fill(value);
  }

  async setTransactionDescriptionFilter(value: string) {
    await this.openTransactions();
    const trigger = this.transactionsSection.locator('.tx-filter-trigger[data-column="description"]');
    await trigger.click();
    await this.transactionsSection.locator("#tx-header-filter-description").fill(value);
  }

  async clearTransactionFilters() {
    await this.openTransactions();
    const clearColumns = ["date", "account", "type", "category", "description", "amount"];
    for (const column of clearColumns) {
      const trigger = this.transactionsSection.locator(`.tx-filter-trigger[data-column="${column}"]`);
      await trigger.click();
      await this.transactionsSection.locator(`.tx-header-clear-btn[data-column="${column}"]`).click();
    }
  }

  async clickSortByDate() {
    await this.openTransactions();
    await this.transactionsSection.getByRole("button", { name: "Ordenar por fecha" }).click();
  }

  async firstTransactionDateText(): Promise<string> {
    const row = this.transactionsSection.locator("#tx-table-body tr").first();
    return (await row.locator("td").nth(1).innerText()).trim();
  }

  async editTransactionByDescription(
    description: string,
    payload: { amount?: number; category?: string; newDescription?: string; date?: string }
  ) {
    await this.openTransactions();
    const row = this.transactionsSection.locator("#tx-table-body tr", { hasText: description }).first();
    await expect(row).toBeVisible();
    await row.getByRole("button", { name: "Editar" }).click();

    const editRow = this.transactionsSection.locator("tr[data-editing-id]").first();
    await expect(editRow).toBeVisible();

    if (payload.date) {
      await editRow.locator('[data-edit-field="date"]').fill(payload.date);
    }
    if (typeof payload.amount === "number") {
      await editRow.locator('[data-edit-field="amount"]').fill(String(payload.amount));
    }
    if (typeof payload.category === "string") {
      await editRow.locator('[data-edit-field="category"]').fill(payload.category);
    }
    if (typeof payload.newDescription === "string") {
      await editRow.locator('[data-edit-field="description"]').fill(payload.newDescription);
    }

    await editRow.getByRole("button", { name: "Guardar" }).click();
    await expect(this.page.getByRole("status")).toContainText("Movimiento actualizado.");
  }

  async setBudgetValue(params: {
    typeValue: "income" | "expense" | "investment";
    monthLabel: string;
    categoryLabel: string;
    plannedValue: number;
  }) {
    await this.openBudget();
    await this.budgetSection.getByLabel("Tipo").selectOption(params.typeValue);
    await this.budgetSection.getByLabel("Mes").selectOption({ label: params.monthLabel });

    const row = this.budgetSection.locator("#budget-table-body tr", {
      hasText: params.categoryLabel,
    });
    await expect(row).toBeVisible();
    const input = row.locator(`input[data-category="${params.categoryLabel}"]`);
    await input.fill(String(params.plannedValue));
  }

  async getBudgetValue(categoryLabel: string): Promise<number> {
    const row = this.budgetSection.locator("#budget-table-body tr", { hasText: categoryLabel });
    const input = row.locator(`input[data-category="${categoryLabel}"]`);
    const value = await input.inputValue();
    return Number(value);
  }

  async saveAccountSnapshot(params: {
    monthLabel: string;
    accountName: string;
    value: number;
  }) {
    await this.openWealth();
    await this.wealthSection.getByLabel("Mes snapshot").selectOption({ label: params.monthLabel });

    const row = this.wealthSection.locator(
      `#snapshot-accounts tr:has(td:text-is("${params.accountName}"))`
    );
    await expect(row).toBeVisible();

    const input = row.locator('input[data-snapshot-kind="accounts"]');
    await input.fill(String(params.value));
    await this.wealthSection.getByRole("button", { name: "Guardar snapshot" }).click();
    await expect(this.page.getByRole("status")).toContainText("Snapshot guardado.");
  }

  async getAccountSnapshotValue(accountName: string): Promise<number> {
    const row = this.wealthSection.locator(`#snapshot-accounts tr:has(td:text-is("${accountName}"))`);
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
    await this.wealthSection.getByLabel("Mes snapshot").selectOption({ label: params.monthLabel });
    const row = this.wealthSection.locator(`#snapshot-investments tr:has(td:text-is("${params.assetName}"))`);
    await expect(row).toBeVisible();
    await row.getByRole("button", { name: `Abrir cálculo de ${params.assetName}` }).click();

    const modal = this.page.locator("#wealth-calc-dialog");
    await expect(modal).toBeVisible();
    await modal.getByLabel("Cálculo numérico").fill(params.expression);
    await modal.getByRole("button", { name: "Aplicar al snapshot" }).click();
    await expect(modal).toBeHidden();

    const snapshotValue = await row.locator('input[data-snapshot-kind="investments"]').inputValue();
    return Number(snapshotValue);
  }

  async saveSnapshot() {
    await this.openWealth();
    await this.wealthSection.getByRole("button", { name: "Guardar snapshot" }).click();
    await expect(this.page.getByRole("status")).toContainText("Snapshot guardado.");
  }

  async getInvestmentSnapshotValue(assetName: string): Promise<number> {
    const row = this.wealthSection.locator(`#snapshot-investments tr:has(td:text-is("${assetName}"))`);
    const input = row.locator('input[data-snapshot-kind="investments"]');
    const value = await input.inputValue();
    return Number(value);
  }

  async getTransactionSummaryTotal(type: "income" | "expense" | "investment"): Promise<number> {
    await this.openTransactions();
    const selector =
      type === "income" ? "#tx-total-income" : type === "expense" ? "#tx-total-expense" : "#tx-total-investment";
    const text = (await this.transactionsSection.locator(selector).innerText()).trim();
    return this.parseMoneyText(text);
  }

  async getTransactionSummaryCategoryAmount(column: "income" | "expense" | "investment", category: string): Promise<number> {
    await this.openTransactions();
    const row = this.transactionsSection.locator(
      `#tx-category-breakdown-body tr[data-summary-type="${column}"][data-summary-category="${category}"]`
    );
    if ((await row.count()) === 0) {
      throw new Error(`No se encontró la categoría ${category} en la columna ${column}.`);
    }
    const amountText = (await row.first().locator(".tx-summary-item > strong").innerText()).trim();
    return this.parseMoneyText(amountText);
  }

  async dashboardIncomeText(): Promise<string> {
    return this.dashboardSection.locator("#kpi-income").innerText();
  }

  async editInvestmentMovementBySymbol(
    symbol: string,
    payload: {
      date?: string;
      time?: string;
      side?: "buy" | "sell";
      newSymbol?: string;
      unitPrice?: number;
      units?: number;
      fee?: number;
      movementCurrency?: string;
      declared?: boolean;
    }
  ) {
    await this.openInvestmentMovementsTab();
    const row = this.investmentSection().locator("#investment-tx-table-body tr", { hasText: symbol }).first();
    await expect(row).toBeVisible();
    await row.getByRole("button", { name: "Editar" }).click();

    const editRow = this.investmentSection().locator("tr[data-investment-editing-id]").first();
    await expect(editRow).toBeVisible();

    if (payload.date) {
      await editRow.locator('[data-edit-field="date"]').fill(payload.date);
    }
    if (payload.time) {
      await editRow.locator('[data-edit-field="time"]').fill(payload.time);
    }
    if (payload.side) {
      await editRow.locator('[data-edit-field="side"]').selectOption(payload.side);
    }
    if (typeof payload.newSymbol === "string") {
      await editRow.locator('[data-edit-field="symbol"]').fill(payload.newSymbol);
    }
    if (typeof payload.unitPrice === "number") {
      await editRow.locator('[data-edit-field="unitPrice"]').fill(String(payload.unitPrice));
    }
    if (typeof payload.units === "number") {
      await editRow.locator('[data-edit-field="units"]').fill(String(payload.units));
    }
    if (typeof payload.fee === "number") {
      await editRow.locator('[data-edit-field="fee"]').fill(String(payload.fee));
    }
    if (typeof payload.movementCurrency === "string") {
      await editRow.locator('[data-edit-field="movementCurrency"]').fill(payload.movementCurrency);
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
    await expect(this.page.getByRole("status")).toContainText("Movimiento de inversión actualizado.");
  }

  async deleteInvestmentMovementBySymbol(symbol: string) {
    await this.openInvestmentMovementsTab();
    const row = this.investmentSection().locator("#investment-tx-table-body tr", { hasText: symbol }).first();
    await expect(row).toBeVisible();
    await row.getByRole("button", { name: "Eliminar" }).click();
    await expect(this.page.getByRole("status")).toContainText("Movimiento eliminado.");
  }

  async filterInvestmentYear(year: number) {
    await this.openInvestmentMovementsTab();
    await this.investmentSection().locator("#investment-year-filter").selectOption(String(year));
  }

  async setInvestmentOnlyUndeclared(enabled: boolean) {
    await this.openInvestmentMovementsTab();
    const input = this.investmentSection().locator("#investment-only-undeclared");
    if (enabled) {
      await input.check();
    } else {
      await input.uncheck();
    }
  }

  async setContributionFlowByDate(date: string, flow: number) {
    await this.openInvestmentContributionsTab();
    const input = this.investmentSection().locator(`input[data-contribution-flow-date="${date}"]`);
    await expect(input).toBeVisible();
    await input.fill(String(flow));
  }

  async getContributionRowTexts(date: string): Promise<string[]> {
    await this.openInvestmentContributionsTab();
    const row = this.investmentSection().locator("#contribution-body tr", { hasText: date }).first();
    await expect(row).toBeVisible();
    return row.locator("td").allInnerTexts();
  }

  async getContributionFlowByDate(date: string): Promise<number> {
    await this.openInvestmentContributionsTab();
    const input = this.investmentSection().locator(`input[data-contribution-flow-date="${date}"]`);
    await expect(input).toBeVisible();
    return Number(await input.inputValue());
  }

  async openContributionWorkflowModal() {
    await this.openInvestmentContributionsTab();
    await this.investmentSection().getByRole("button", { name: "Añadir aporte" }).click();
    await expect(this.page.locator("#contribution-workflow-dialog")).toBeVisible();
  }

  async contributionWorkflowSelectMonth(monthLabel: string) {
    const modal = this.page.locator("#contribution-workflow-dialog");
    await modal.locator("#contribution-workflow-month").selectOption({ label: monthLabel });
  }

  async contributionWorkflowSetDate(date: string) {
    const modal = this.page.locator("#contribution-workflow-dialog");
    await modal.locator("#contribution-workflow-date").fill(date);
  }

  async contributionWorkflowDateValue(): Promise<string> {
    const modal = this.page.locator("#contribution-workflow-dialog");
    return modal.locator("#contribution-workflow-date").inputValue();
  }

  async contributionWorkflowSetInvestmentSnapshot(assetName: string, value: number) {
    const modal = this.page.locator("#contribution-workflow-dialog");
    const row = modal.locator("#contribution-workflow-investments-body tr", { hasText: assetName });
    await expect(row).toBeVisible();
    await row.locator('input[data-contribution-snapshot-kind="investments"]').fill(String(value));
  }

  async contributionWorkflowApplySnapshotCalculator(params: {
    type: "investment" | "liquidity";
    rowName: string;
    expression: string;
  }) {
    const modal = this.page.locator("#contribution-workflow-dialog");
    const tbodySelector =
      params.type === "investment" ? "#contribution-workflow-investments-body" : "#contribution-workflow-liquidity-body";
    const row = modal.locator(`${tbodySelector} tr`, { hasText: params.rowName });
    await expect(row).toBeVisible();
    await row.getByRole("button", { name: `Calcular snapshot de ${params.rowName}` }).click();
    const calc = this.page.locator("#contribution-calc-dialog");
    await expect(calc).toHaveJSProperty("open", true);
    await calc.locator("#contribution-calc-expression").fill(params.expression);
    await calc.getByRole("button", { name: "Aplicar al snapshot" }).click();
    await expect(calc).toHaveJSProperty("open", false);
    await expect(this.page.locator("#contribution-workflow-dialog")).toBeVisible();
  }

  async contributionWorkflowSetLiquiditySnapshot(accountName: string, value: number) {
    const modal = this.page.locator("#contribution-workflow-dialog");
    const row = modal.locator("#contribution-workflow-liquidity-body tr", { hasText: accountName });
    await expect(row).toBeVisible();
    await row.locator('input[data-contribution-snapshot-kind="accounts"]').fill(String(value));
  }

  async contributionWorkflowGoToAllocationStep() {
    const modal = this.page.locator("#contribution-workflow-dialog");
    await modal.getByRole("button", { name: "Siguiente" }).click();
    await expect(modal.locator("#contribution-workflow-step-allocation")).toBeVisible();
  }

  async contributionWorkflowSetTotal(value: number) {
    const modal = this.page.locator("#contribution-workflow-dialog");
    await modal.locator("#contribution-workflow-total").fill(String(value));
  }

  async contributionWorkflowSetAllocation(accountName: string, value: number) {
    const modal = this.page.locator("#contribution-workflow-dialog");
    const row = modal.locator("#contribution-workflow-allocation-body tr", { hasText: accountName });
    await expect(row).toBeVisible();
    await row.locator('input[data-contribution-allocation-account-id]').fill(String(value));
  }

  contributionWorkflowSnapshotWarning(): Locator {
    return this.page.locator("#contribution-workflow-snapshot-warning");
  }

  contributionWorkflowAllocationWarning(): Locator {
    return this.page.locator("#contribution-workflow-allocation-warning");
  }

  async contributionWorkflowSave() {
    const modal = this.page.locator("#contribution-workflow-dialog");
    await modal.getByRole("button", { name: "Guardar aporte (con avisos)" }).click();
  }

  async getInvestmentMovementsOperations(): Promise<string[]> {
    await this.openInvestmentMovementsTab();
    const rows = this.investmentSection().locator("#investment-tx-table-body tr");
    const count = await rows.count();
    const operations: string[] = [];
    for (let index = 0; index < count; index += 1) {
      const operation = (await rows.nth(index).locator("td").nth(2).innerText()).trim();
      operations.push(operation);
    }
    return operations;
  }

  investmentSection(): Locator {
    return this.page.locator("#investment");
  }

  async reload() {
    await this.page.reload();
    await expect(this.page.locator(".panel.is-active h2").first()).toBeVisible();
  }

  private async openSection(buttonLabel: string, sectionId: string, headingText: string) {
    const section = this.page.locator(`#${sectionId}`);
    if (!(await section.isVisible())) {
      await this.page.getByRole("button", { name: buttonLabel }).click();
    }
    await expect(section).toBeVisible();
    await expect(section.getByRole("heading", { name: headingText })).toBeVisible();
  }

  private async selectByLabelOrFirst(select: Locator, label: string) {
    const options = await select.locator("option").allTextContents();
    if (options.map((item) => item.trim()).includes(label)) {
      await select.selectOption({ label });
      return;
    }

    const firstValue = await select.locator("option").first().getAttribute("value");
    if (firstValue) {
      await select.selectOption(firstValue);
    }
  }

  private async ensureTransactionModalOpen() {
    const isOpen = await this.transactionsSection.locator("#tx-dialog").evaluate((dialog) => {
      return (dialog as HTMLDialogElement).open;
    });
    if (!isOpen) {
      await this.transactionsSection.getByRole("button", { name: "Nuevo" }).click();
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

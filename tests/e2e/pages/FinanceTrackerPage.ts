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

  get budgetSection(): Locator {
    return this.page.locator("#budget");
  }

  get wealthSection(): Locator {
    return this.page.locator("#wealth");
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

  async openGoals() {
    await this.open("goals");
  }

  async openSettings() {
    await this.open("settings");
  }

  async openData() {
    await this.open("data");
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
    await this.transactionsSection.locator("#tx-filter-category").fill(value);
  }

  async setTransactionDescriptionFilter(value: string) {
    await this.openTransactions();
    await this.transactionsSection.locator("#tx-filter-description").fill(value);
  }

  async clearTransactionFilters() {
    await this.openTransactions();
    await this.transactionsSection.getByRole("button", { name: "Limpiar filtros" }).click();
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

  async dashboardIncomeText(): Promise<string> {
    return this.dashboardSection.locator("#kpi-income").innerText();
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
}

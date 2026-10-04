import { expect, type Locator, type Page } from '@playwright/test'

const SECTION_CONFIG = {
  dashboard: { buttonLabel: 'Dashboard', headingText: /^Dashboard$/ },
  transactions: {
    buttonLabel: 'Movimientos',
    headingText: /^Movimientos$/,
  },
  budget: { buttonLabel: 'Presupuesto', headingText: 'Presupuesto' },
  wealth: { buttonLabel: 'Patrimonio', headingText: /^Patrimonio$/ },
  investment: { buttonLabel: 'Inversión', headingText: /^Inversión$/ },
  goals: { buttonLabel: 'Objetivos', headingText: 'Objetivos' },
  settings: { buttonLabel: 'Configuración', headingText: /^Configuración$/ },
  data: { buttonLabel: 'Datos', headingText: 'Datos y backups' },
} as const

export type FinanceSectionId = keyof typeof SECTION_CONFIG

const TX_TYPE_LABEL = {
  income: 'Ingreso',
  expense: 'Gasto',
  investment: 'Inversión',
} as const

/** "FEBRERO" → "Febrero", as the panel's month select names it. */
function monthOptionLabel(monthLabel: string): string {
  const lower = monthLabel.toLowerCase()
  return lower.charAt(0).toUpperCase() + lower.slice(1)
}

const MONTH_INDEX: Record<string, number> = Object.fromEntries(
  [
    'enero',
    'febrero',
    'marzo',
    'abril',
    'mayo',
    'junio',
    'julio',
    'agosto',
    'septiembre',
    'octubre',
    'noviembre',
    'diciembre',
  ].map((name, index) => [name, index]),
)

export class FinanceTrackerPage {
  /** Month the registry band was last moved to, for month-scoped row counts. */
  private transactionsMonth: number | null = null

  constructor(private readonly page: Page) {}

  get dashboardSection(): Locator {
    return this.page.locator('#dashboard')
  }

  get transactionsSection(): Locator {
    return this.page.locator('#transactions')
  }

  get transactionsBreakdown(): Locator {
    return this.transactionsSection.locator('[data-tx-breakdown]')
  }

  /** The movement side panel (create and edit). */
  get transactionPanel(): Locator {
    return this.page.getByRole('dialog', { name: /^(Nuevo|Editar) movimiento$/ })
  }

  /** Ledger rows of the registry, every month shown. */
  get transactionRows(): Locator {
    return this.transactionsSection.locator('[data-tx-ledger] tr[data-tx-id]')
  }

  transactionRow(description: string): Locator {
    return this.transactionRows.filter({ hasText: description }).first()
  }

  get budgetSection(): Locator {
    return this.page.locator('#budget')
  }

  get wealthSection(): Locator {
    return this.page.locator('#wealth')
  }

  get goalsSection(): Locator {
    return this.page.locator('#goals')
  }

  get dataSection(): Locator {
    return this.page.locator('#data')
  }

  get issueReportDialog(): Locator {
    return this.page.locator('#global-report-dialog')
  }

  async goto() {
    await this.page.goto('/')
    await expect(this.page.locator('html[data-finance-ready="true"]')).toBeVisible()
    await expect(
      this.dashboardSection.getByRole('heading', {
        name: 'Dashboard',
        exact: true,
      }),
    ).toBeVisible()
  }

  async openDashboard() {
    await this.open('dashboard')
  }

  async logout() {
    await this.page.getByRole('button', { name: 'Abrir menú de usuario' }).click()
    await this.page.getByRole('menuitem', { name: /Cerrar sesión/ }).click()
  }

  async openTransactions() {
    await this.open('transactions')
  }

  async openSubscriptionsTab() {
    await this.openTransactions()
    await this.transactionsSection.getByRole('tab', { name: 'Suscripciones' }).click()
  }

  /** The subscription side panel (create and edit). */
  get subscriptionPanel(): Locator {
    return this.page.getByRole('dialog', { name: /^(Nueva|Editar) suscripción$/ })
  }

  async openNewSubscriptionPanel() {
    await this.openSubscriptionsTab()
    await this.transactionsSection.getByRole('button', { name: 'Nueva suscripción' }).click()
    await expect(this.subscriptionPanel).toBeVisible()
  }

  async addSubscription(params: {
    name: string
    amount: number
    categoryLabel: string
    frequency: 'weekly' | 'monthly' | 'quarterly' | 'yearly'
    firstChargeDate: string
  }) {
    await this.openNewSubscriptionPanel()
    const panel = this.subscriptionPanel
    await panel.getByLabel('Nombre').fill(params.name)
    await panel.getByLabel('Importe').fill(String(params.amount))
    await this.selectByLabelOrFirst(panel.getByLabel('Cuenta'), 'Revolut')
    await this.selectByLabelOrFirst(panel.getByLabel('Categoría'), params.categoryLabel)
    await panel.locator(`button[data-frequency="${params.frequency}"]`).click()
    await panel.getByLabel('Primer cobro').fill(params.firstChargeDate)
    await panel.getByRole('button', { name: 'Añadir suscripción' }).click()
  }

  async openBudget() {
    await this.open('budget')
  }

  async openWealth() {
    await this.open('wealth')
  }

  async openInvestment() {
    await this.open('investment')
  }

  async openInvestmentDashboardTab() {
    await this.openInvestment()
    await this.investmentSection().getByRole('tab', { name: 'Resumen' }).click()
  }

  async openInvestmentMovementsTab() {
    await this.openInvestment()
    await this.investmentSection().getByRole('tab', { name: 'Movimientos' }).click()
  }

  async openInvestmentContributionsTab() {
    await this.openInvestment()
    await this.investmentSection().getByRole('tab', { name: 'Aportes' }).click()
  }

  async openInvestmentRecurringTab() {
    await this.openInvestment()
    await this.investmentSection().getByRole('tab', { name: 'Compras recurrentes' }).click()
  }

  async openGoals() {
    await this.open('goals')
  }

  /** A goal's row in its ledger, by its slot key ("short", "investmentFunds"…). */
  goalRow(key: string): Locator {
    return this.goalsSection.locator(`[data-goal-row="${key}"]`)
  }

  goalPanel(): Locator {
    return this.page.locator('#goal-panel')
  }

  /** Opens the side panel of a goal from its row's edit button. */
  async openGoalPanel(key: string) {
    await this.openGoals()
    const button = this.goalRow(key).getByRole('button', { name: /^(Editar|Definir) / })
    // On a phone the fixed bottom nav covers a row scrolled just into view.
    await button.evaluate((element) => element.scrollIntoView({ block: 'center' }))
    await button.click()
    await expect(this.goalPanel()).toBeVisible()
  }

  async openSettings() {
    await this.open('settings')
  }

  /** Opens a tab of Configuración: "Cuentas", "Activos", "Preferencias"… */
  async openSettingsTab(label: string) {
    await this.openSettings()
    await this.section('settings').getByRole('tab', { name: label }).click()
  }

  /**
   * Opens the card of an account or asset in its side panel, from its tab.
   * Returns the panel.
   */
  async openSettingsCard(tab: 'Cuentas' | 'Activos' | 'Pasivos', name: string): Promise<Locator> {
    await this.openSettingsTab(tab)
    await this.section('settings')
      .getByRole('button', { name: `Abrir la ficha de ${name}`, exact: true })
      .click()
    const panel = this.page.getByRole('dialog', { name })
    await expect(panel).toBeVisible()
    return panel
  }

  async openStockEventsConnection() {
    await this.openSettingsTab('Conexiones')
    await this.page.getByRole('button', { name: 'Stock Events', exact: true }).click()
    await expect(this.page.getByRole('dialog', { name: 'Stock Events', exact: true })).toBeVisible()
  }

  async closeStockEventsConnection() {
    await this.page
      .getByRole('dialog', { name: 'Stock Events', exact: true })
      .getByRole('button', { name: 'Cerrar', exact: true })
      .click()
    await expect(this.page.getByRole('dialog', { name: 'Stock Events', exact: true })).toBeHidden()
  }

  async openData() {
    await this.open('data')
  }

  /** Picks a backup file in Datos, which opens the import confirmation. */
  async chooseImportFile() {
    await this.page.locator('#import-json').setInputFiles({
      name: 'finance-tracker-copia.json',
      mimeType: 'application/json',
      buffer: Buffer.from('{}'),
    })
    await expect(this.page.getByRole('alertdialog', { name: '¿Importar esta copia?' })).toBeVisible()
  }

  async openGlobalReportDialog() {
    await this.page.locator('#global-report-trigger').click()
    await expect(this.issueReportDialog).toBeVisible()
  }

  async submitIssueReport(params: {
    // Only the two options `#issue-report-type` actually renders. The wider
    // `ReportType` in `src/services/issue-report-api.ts` still allows
    // "enhancement", but the UI dropped it, so asking for it here just made
    // `selectOption` hang until the test timed out.
    type: 'bug' | 'feature'
    summary: string
    description: string
    expectedResult?: string
    actualResult?: string
  }) {
    await this.openGlobalReportDialog()
    const form = this.issueReportDialog.locator('#issue-report-form')
    await form.locator('#issue-report-type').selectOption(params.type)
    await form.locator('#issue-report-summary').fill(params.summary)
    await form.locator('#issue-report-description').fill(params.description)
    if (params.expectedResult !== undefined) {
      await form.locator('#issue-report-expected').fill(params.expectedResult)
    }
    if (params.actualResult !== undefined) {
      await form.locator('#issue-report-actual').fill(params.actualResult)
    }
    await form.getByRole('button', { name: 'Crear reporte' }).click()
  }

  issueReportStatus(): Locator {
    return this.issueReportDialog.locator('#issue-report-status')
  }

  async open(sectionId: FinanceSectionId) {
    const sectionConfig = SECTION_CONFIG[sectionId]
    await this.openSection(sectionConfig.buttonLabel, sectionId, sectionConfig.headingText)
  }

  section(sectionId: FinanceSectionId): Locator {
    return this.page.locator(`#${sectionId}`)
  }

  async setDashboardMonth(monthLabel: string) {
    await this.openDashboard()
    await this.dashboardSection.getByLabel('Mes').selectOption({ label: monthLabel })
  }

  async addIncomeTransaction(params: {
    date: string
    monthLabel: string
    categoryLabel: string
    amount: number
    description: string
  }) {
    await this.addCustomTransaction({ ...params, type: 'income' })
  }

  async addCustomTransaction(params: {
    date: string
    monthLabel: string
    type: 'income' | 'expense' | 'investment'
    categoryLabel: string
    amount: number
    description: string
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
    accountLabel?: string
  }) {
    await this.fillTransactionPanel(params)
    await this.transactionPanel.getByRole('button', { name: 'Guardar movimiento' }).click()
    await expect(this.page.locator('#toast')).toContainText('Movimiento guardado.')
  }

  async addCustomTransactionKeepOpen(params: {
    date: string
    monthLabel: string
    type: 'income' | 'expense' | 'investment'
    categoryLabel: string
    amount: number
    description: string
  }) {
    await this.fillTransactionPanel(params)
    await this.transactionPanel.getByRole('button', { name: 'Guardar y añadir otro' }).click()
    await expect(this.page.getByRole('status')).toContainText('Guardado. Puedes añadir otro.')
  }

  private async fillTransactionPanel(params: {
    date: string
    monthLabel: string
    type: 'income' | 'expense' | 'investment'
    categoryLabel: string
    amount: number
    description: string
    accountLabel?: string
  }) {
    await this.openTransactions()
    await this.ensureTransactionModalOpen()
    const panel = this.transactionPanel
    await panel
      .getByRole('group', { name: 'Tipo de movimiento' })
      .getByRole('button', { name: TX_TYPE_LABEL[params.type], exact: true })
      .click()
    await panel.getByLabel('Fecha').fill(params.date)
    await panel
      .getByLabel('Cuenta en el mes')
      .selectOption({ label: monthOptionLabel(params.monthLabel) })
    await this.selectByLabelOrFirst(
      panel.getByLabel('Cuenta', { exact: true }),
      params.accountLabel ?? 'Revolut',
    )
    await this.selectByLabelOrFirst(panel.getByLabel('Categoría'), params.categoryLabel)
    await panel.getByLabel('Descripción').fill(params.description)
    await panel.getByLabel('Importe').fill(String(params.amount))
  }

  /** The investment movement side panel, opened from "Nuevo movimiento". */
  investmentMovementPanel() {
    return this.page.locator('#investment-movement-panel')
  }

  /** Opens the panel to create a movement; reuses it when it is already open. */
  async openInvestmentMovementPanel() {
    const panel = this.investmentMovementPanel()
    if (await panel.isVisible()) return panel
    await this.openInvestmentMovementsTab()
    await this.investmentSection().getByRole('button', { name: 'Nuevo movimiento' }).click()
    await expect(panel).toBeVisible()
    return panel
  }

  /** The ledger row of the first investment movement with this symbol. */
  investmentMovementRow(symbol: string) {
    return this.investmentSection()
      .locator('tr[data-investment-tx-id]', { hasText: symbol })
      .first()
  }

  async addInvestmentMovement(params: {
    date: string
    time: string
    side: 'buy' | 'sell'
    symbol: string
    category?: string
    unitPrice: number
    units: number
    fee: number
    movementCurrency?: string
    brokerName?: string
    declared?: boolean
    stockEventsCash?: boolean
  }) {
    const section = await this.openInvestmentMovementPanel()
    await section.locator('#investment-movement-date').fill(params.date)
    await section.locator('#investment-movement-time').fill(params.time)
    await section.locator(`[data-investment-side="${params.side}"]`).click()
    await section.locator('#investment-movement-symbol').fill(params.symbol)
    await section.locator('#investment-movement-unit-price').fill(String(params.unitPrice))
    await section.locator('#investment-movement-units').fill(String(params.units))
    await section.locator('#investment-movement-fee').fill(String(params.fee))
    if (params.movementCurrency) {
      await section.locator('#investment-movement-currency').fill(params.movementCurrency)
    }
    await this.selectByLabelOrFirst(
      section.locator('#investment-movement-broker'),
      params.brokerName || 'Revolut',
    )
    if (params.category !== undefined) {
      const categorySelect = section.locator('#investment-movement-category')
      if (!(await categorySelect.isDisabled())) {
        await this.selectByLabelOrFirst(categorySelect, params.category)
      }
    }

    const declaredInput = section.locator('#investment-movement-declared')
    if (params.declared) {
      await declaredInput.check()
    } else {
      await declaredInput.uncheck()
    }

    const stockEventsCashInput = section.locator('#investment-movement-to-cash')
    if (params.stockEventsCash && (await stockEventsCashInput.count()) > 0) {
      await stockEventsCashInput.check()
    }

    await section.getByRole('button', { name: 'Guardar movimiento' }).click()
    await expect(this.page.getByRole('status')).toContainText('Movimiento de inversión guardado.')
    await expect(section).toBeHidden()
  }

  async addAccount(params: { name: string; openingBalance?: number }) {
    await this.openSettingsTab('Cuentas')
    await this.section('settings').getByRole('button', { name: 'Nueva cuenta' }).click()
    const panel = this.page.locator('#settings-account-panel')
    await expect(panel).toBeVisible()
    await panel.getByLabel('Nombre').fill(params.name)
    await panel.getByLabel('Saldo inicial (€)').fill(String(params.openingBalance ?? 0))
    await panel.getByRole('button', { name: 'Crear cuenta' }).click()
    await expect(this.page.getByRole('status')).toContainText('Elemento agregado.')
    await expect(panel).toBeHidden()
  }

  async setTwrLiquidityAccountEnabled(accountName: string, enabled: boolean) {
    const panel = await this.openSettingsCard('Cuentas', accountName)
    const toggle = panel.getByRole('switch', {
      name: `${accountName} es liquidez de la cartera`,
    })
    if ((await toggle.isChecked()) !== enabled) {
      // The checkbox is visually hidden under its drawn track.
      await toggle.setChecked(enabled, { force: true })
      await expect(this.page.getByRole('status')).toContainText('Configuración TWR actualizada.')
    }
    await expect(toggle).toBeChecked({ checked: enabled })
    await panel.getByRole('button', { name: 'Cancelar' }).click()
    await expect(panel).toBeHidden()
  }

  async transactionModalDateValue(): Promise<string> {
    await this.openTransactions()
    await this.ensureTransactionModalOpen()
    return this.transactionPanel.getByLabel('Fecha').inputValue()
  }

  async transactionModalCategoryValue(): Promise<string> {
    await this.openTransactions()
    await this.ensureTransactionModalOpen()
    return this.transactionPanel.getByLabel('Categoría').inputValue()
  }

  async selectTransactionByDescription(description: string) {
    await this.openTransactions()
    await this.revealOlderTransactions()
    const row = this.transactionRow(description)
    await expect(row).toBeVisible()
    await row.locator('input[data-select-tx-id]').check()
  }

  /** The contextual bar shown while rows are selected. */
  get bulkActionBar(): Locator {
    return this.page.getByRole('region', { name: 'Acciones sobre la selección' })
  }

  async applyBulkTransactionChanges(params: {
    type?: 'income' | 'expense' | 'investment'
    accountName?: string
    category?: string
  }) {
    const bar = this.bulkActionBar
    if (params.type) {
      await bar.getByLabel('Cambiar tipo').selectOption(params.type)
    }
    if (params.accountName) {
      await this.selectByLabelOrFirst(bar.getByLabel('Mover a cuenta'), params.accountName)
    }
    if (params.category !== undefined) {
      await bar.getByLabel('Cambiar categoría').selectOption({ label: params.category })
    }
    await bar.getByRole('button', { name: 'Aplicar' }).click()
  }

  async deleteSelectedTransactions() {
    await this.bulkActionBar.getByRole('button', { name: 'Eliminar' }).click()
  }

  /**
   * Moves the registry's ink band to a month (of 2026 by default, the year of
   * the seed) with its arrows, so the totals, breakdown and month-scoped row
   * counts refer to it.
   */
  async filterTransactionsMonth(monthLabel: string, year = 2026) {
    await this.openTransactions()
    const yearSelect = this.registryToolbar.getByLabel('Año', { exact: true })
    if ((await yearSelect.inputValue()) !== String(year)) {
      await yearSelect.selectOption(String(year))
    }
    const target = MONTH_INDEX[monthLabel.toLowerCase()]
    const title = this.transactionsSection.locator('#tx-month-title')
    for (let step = 0; step < 24; step += 1) {
      const text = ((await title.textContent()) ?? '').toLowerCase()
      const current = Object.keys(MONTH_INDEX).find((name) => text.includes(` ${name} `))
      if (current === undefined) {
        throw new Error(`No se pudo leer el mes de la franja: ${text}`)
      }
      const delta = target - MONTH_INDEX[current]
      if (delta === 0) {
        break
      }
      await this.transactionsSection
        .getByRole('button', { name: delta < 0 ? 'Mes anterior' : 'Mes siguiente' })
        .click()
    }
    await expect(title).toContainText(`${monthLabel.toLowerCase()} ${year}`)
    this.transactionsMonth = target
  }

  /** Unfolds the months the registry keeps behind "Ver … y anteriores". */
  async revealOlderTransactions() {
    const more = this.transactionsSection.getByRole('button', {
      name: /^Ver .+ y anteriores/,
    })
    if (await more.isVisible()) {
      await more.click()
    }
  }

  async expectTransactionDescriptionVisible(description: string) {
    await this.revealOlderTransactions()
    await expect(this.transactionRow(description)).toBeVisible()
  }

  /** Rows of the month last chosen with `filterTransactionsMonth`, or every row shown. */
  async getTransactionRowCount(): Promise<number> {
    await this.revealOlderTransactions()
    const rows =
      this.transactionsMonth === null
        ? this.transactionRows
        : this.transactionsSection.locator(
            `[data-tx-ledger] tr[data-tx-month="${this.transactionsMonth}"]`,
          )
    return rows.count()
  }

  get registryToolbar(): Locator {
    return this.transactionsSection.locator('[data-registry-toolbar]')
  }

  get transactionSearch(): Locator {
    return this.registryToolbar.getByLabel('Buscar movimientos')
  }

  /** Turns a type chip of the registry toolbar on or off. */
  async setTransactionTypeChip(label: string, on: boolean) {
    const chip = this.registryToolbar
      .getByRole('group', { name: 'Filtrar por tipo' })
      .locator('label', { hasText: label })
    if ((await chip.locator('input').isChecked()) !== on) {
      await chip.click()
    }
  }

  async setTransactionCategoryFilter(value: string) {
    await this.openTransactions()
    await this.transactionSearch.fill(value)
  }

  async setTransactionDescriptionFilter(value: string) {
    await this.openTransactions()
    await this.transactionSearch.fill(value)
  }

  async clearTransactionFilters() {
    await this.openTransactions()
    await this.transactionSearch.fill('')
    await this.registryToolbar
      .getByLabel('Cuenta', { exact: true })
      .selectOption({ label: 'Todas las cuentas' })
    for (const label of ['Ingresos', 'Gastos', 'Inversión']) {
      await this.setTransactionTypeChip(label, true)
    }
  }

  async clickSortByDate() {
    await this.openTransactions()
    await this.transactionsSection.getByRole('button', { name: /^Ordenar por fecha/ }).click()
  }

  /** Description of the first row the ledger shows. */
  async firstTransactionDescription(): Promise<string> {
    const row = this.transactionRows.first()
    return (await row.locator('th').innerText()).split('\n')[0].trim()
  }

  async editTransactionByDescription(
    description: string,
    payload: {
      amount?: number
      category?: string
      newDescription?: string
      date?: string
    },
  ) {
    await this.openTransactions()
    await this.revealOlderTransactions()
    const row = this.transactionRow(description)
    await expect(row).toBeVisible()
    await row.getByRole('button', { name: /^Editar/ }).click()

    const panel = this.transactionPanel
    await expect(panel.getByRole('heading', { name: 'Editar movimiento' })).toBeVisible()

    if (payload.date) {
      await panel.getByLabel('Fecha').fill(payload.date)
    }
    if (typeof payload.amount === 'number') {
      await panel.getByLabel('Importe').fill(String(payload.amount))
    }
    if (typeof payload.category === 'string') {
      await this.selectByLabelOrFirst(panel.getByLabel('Categoría'), payload.category)
    }
    if (typeof payload.newDescription === 'string') {
      await panel.getByLabel('Descripción').fill(payload.newDescription)
    }

    await panel.getByRole('button', { name: 'Guardar cambios' }).click()
    await expect(this.page.getByRole('status')).toContainText('Movimiento actualizado.')
  }

  async setBudgetValue(params: {
    typeValue: 'income' | 'expense' | 'investment'
    monthLabel: string
    categoryLabel: string
    plannedValue: number
  }) {
    await this.openBudget()
    const monthIndex = [
      'ENERO',
      'FEBRERO',
      'MARZO',
      'ABRIL',
      'MAYO',
      'JUNIO',
      'JULIO',
      'AGOSTO',
      'SEPTIEMBRE',
      'OCTUBRE',
      'NOVIEMBRE',
      'DICIEMBRE',
    ].indexOf(params.monthLabel)
    const block = this.budgetSection.locator(`[data-budget-type="${params.typeValue}"]`)
    const row = block.locator('tbody tr', {
      hasText: params.categoryLabel,
    })
    await expect(row).toBeVisible()
    const input = row.locator(
      `input[data-category="${params.categoryLabel}"][data-type="${params.typeValue}"][data-month="${monthIndex}"]`,
    )
    await input.fill(String(params.plannedValue))
  }

  async getBudgetValue(params: {
    typeValue: 'income' | 'expense' | 'investment'
    monthLabel: string
    categoryLabel: string
  }): Promise<number> {
    const monthIndex = [
      'ENERO',
      'FEBRERO',
      'MARZO',
      'ABRIL',
      'MAYO',
      'JUNIO',
      'JULIO',
      'AGOSTO',
      'SEPTIEMBRE',
      'OCTUBRE',
      'NOVIEMBRE',
      'DICIEMBRE',
    ].indexOf(params.monthLabel)
    const block = this.budgetSection.locator(`[data-budget-type="${params.typeValue}"]`)
    const row = block.locator('tbody tr', { hasText: params.categoryLabel })
    const input = row.locator(
      `input[data-category="${params.categoryLabel}"][data-type="${params.typeValue}"][data-month="${monthIndex}"]`,
    )
    const value = await input.inputValue()
    return Number(value)
  }

  /** Picks a month in the band's month strip ("MARZO" or "marzo"). */
  async selectWealthMonth(monthLabel: string) {
    const month = MONTH_INDEX[monthLabel.toLowerCase()]
    await this.wealthSection.locator(`[data-wealth-months] [data-month="${month}"]`).click()
  }

  /** The snapshot cell of an account, asset or debt in the snapshot ledger. */
  wealthSnapshotInput(name: string): Locator {
    return this.wealthSection.getByRole('textbox', {
      name: `Snapshot de ${name}`,
      exact: true,
    })
  }

  async readWealthSnapshot(name: string): Promise<number> {
    const value = await this.wealthSnapshotInput(name).inputValue()
    return Number(value.replace(/\./g, '').replace(',', '.'))
  }

  async saveAccountSnapshot(params: { monthLabel: string; accountName: string; value: number }) {
    await this.openWealth()
    await this.selectWealthMonth(params.monthLabel)
    await this.wealthSnapshotInput(params.accountName).fill(String(params.value).replace('.', ','))
    // The toast fires as soon as local state commits, but the app mirrors the
    // blob to the server asynchronously. Tests that reload right after saving
    // would otherwise race that PUT and read back the pre-save server copy, so
    // wait for the request that actually carries this value.
    const persisted = this.page.waitForResponse(
      (response) =>
        response.url().includes('/api/state') &&
        response.request().method() === 'PUT' &&
        (response.request().postData() ?? '').includes(String(params.value)),
    )
    await this.saveSnapshot()
    await persisted
  }

  async getAccountSnapshotValue(accountName: string): Promise<number> {
    return this.readWealthSnapshot(accountName)
  }

  wealthCalcPanel(): Locator {
    return this.page.getByRole('dialog', { name: 'Calcular saldo' })
  }

  async applyInvestmentSnapshotCalculation(params: {
    monthLabel: string
    assetName: string
    expression: string
  }): Promise<number> {
    await this.openWealth()
    await this.selectWealthMonth(params.monthLabel)
    await this.wealthSection
      .getByRole('button', { name: `Calcular el saldo de ${params.assetName}` })
      .click()

    const panel = this.wealthCalcPanel()
    await expect(panel).toBeVisible()
    await panel.getByLabel('Cálculo numérico').fill(params.expression)
    await panel.getByRole('button', { name: 'Aplicar al snapshot' }).click()
    await expect(panel).toBeHidden()

    return this.readWealthSnapshot(params.assetName)
  }

  async saveSnapshot() {
    await this.openWealth()
    await this.wealthSection.locator('[data-save-snapshot]').click()
    await expect(
      this.page.getByRole('status').filter({ hasText: /Snapshot de .+ guardado\./ }),
    ).toBeVisible()
  }

  async getInvestmentSnapshotValue(assetName: string): Promise<number> {
    return this.readWealthSnapshot(assetName)
  }

  async getTransactionSummaryTotal(type: 'income' | 'expense' | 'investment'): Promise<number> {
    await this.openTransactions()
    const selector =
      type === 'income'
        ? '#tx-total-income'
        : type === 'expense'
          ? '#tx-total-expense'
          : '#tx-total-investment'
    const text = (await this.transactionsSection.locator(selector).innerText()).trim()
    return this.parseMoneyText(text)
  }

  /** Shows one type in the month's breakdown by category. */
  async showTransactionBreakdown(type: 'income' | 'expense' | 'investment') {
    await this.transactionsBreakdown.locator(`button[data-breakdown-type="${type}"]`).click()
  }

  async getTransactionSummaryCategoryAmount(
    column: 'income' | 'expense' | 'investment',
    category: string,
  ): Promise<number> {
    await this.openTransactions()
    await this.showTransactionBreakdown(column)
    const row = this.transactionsBreakdown.locator(
      `li[data-summary-type="${column}"][data-summary-category="${category}"]`,
    )
    if ((await row.count()) === 0) {
      throw new Error(`No se encontró la categoría ${category} en la columna ${column}.`)
    }
    const amountText = (await row.first().locator('[data-summary-amount]').innerText()).trim()
    return this.parseMoneyText(amountText)
  }

  async dashboardIncomeText(): Promise<string> {
    return this.dashboardSection.locator('#kpi-income').innerText()
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
    await this.openDashboard()
    const value = await this.dashboardSection.locator('#year-display').inputValue()
    const year = Number(value)
    if (!Number.isInteger(year) || year <= 0) {
      throw new Error(`#year-display returned an unusable year: "${value}"`)
    }
    return year
  }

  async editInvestmentMovementBySymbol(
    symbol: string,
    payload: {
      date?: string
      time?: string
      side?: 'buy' | 'sell'
      newSymbol?: string
      category?: string
      unitPrice?: number
      units?: number
      fee?: number
      movementCurrency?: string
      declared?: boolean
    },
  ) {
    await this.openInvestmentMovementsTab()
    const row = this.investmentMovementRow(symbol)
    await expect(row).toBeVisible()
    await row.getByRole('button', { name: /^Editar / }).click()

    const panel = this.investmentMovementPanel()
    await expect(panel).toBeVisible()

    if (payload.date) {
      await panel.locator('#investment-movement-date').fill(payload.date)
    }
    if (payload.time) {
      await panel.locator('#investment-movement-time').fill(payload.time)
    }
    if (payload.side) {
      await panel.locator(`[data-investment-side="${payload.side}"]`).click()
    }
    if (typeof payload.newSymbol === 'string') {
      await panel.locator('#investment-movement-symbol').fill(payload.newSymbol)
    }
    if (typeof payload.category === 'string') {
      await this.selectByLabelOrFirst(
        panel.locator('#investment-movement-category'),
        payload.category,
      )
    }
    if (typeof payload.unitPrice === 'number') {
      await panel.locator('#investment-movement-unit-price').fill(String(payload.unitPrice))
    }
    if (typeof payload.units === 'number') {
      await panel.locator('#investment-movement-units').fill(String(payload.units))
    }
    if (typeof payload.fee === 'number') {
      await panel.locator('#investment-movement-fee').fill(String(payload.fee))
    }
    if (typeof payload.movementCurrency === 'string') {
      await panel.locator('#investment-movement-currency').fill(payload.movementCurrency)
    }
    if (typeof payload.declared === 'boolean') {
      const checkbox = panel.locator('#investment-movement-declared')
      if (payload.declared) {
        await checkbox.check()
      } else {
        await checkbox.uncheck()
      }
    }

    await panel.getByRole('button', { name: 'Guardar cambios' }).click()
    await expect(this.page.getByRole('status')).toContainText(
      'Movimiento de inversión actualizado.',
    )
    await expect(panel).toBeHidden()
  }

  async expectInvestmentMovementCategory(symbol: string, category: string) {
    await this.openInvestmentMovementsTab()
    const row = this.investmentMovementRow(symbol)
    await expect(row).toBeVisible()
    await expect(row).toContainText(category)
  }

  async deleteInvestmentMovementBySymbol(symbol: string) {
    await this.openInvestmentMovementsTab()
    const row = this.investmentMovementRow(symbol)
    await expect(row).toBeVisible()
    await row.getByRole('button', { name: /^Eliminar / }).click()
    const dialog = this.page.getByRole('alertdialog', {
      name: '¿Eliminar este movimiento?',
    })
    await expect(dialog).toBeVisible()
    await dialog.getByRole('button', { name: 'Eliminar', exact: true }).click()
    await expect(this.page.getByRole('status')).toContainText('Movimiento eliminado.')
  }

  async filterInvestmentYear(year: number) {
    await this.openInvestmentMovementsTab()
    await this.investmentSection().locator('#investment-year-filter').selectOption(String(year))
  }

  async setInvestmentOnlyUndeclared(enabled: boolean) {
    await this.openInvestmentMovementsTab()
    // The chip hides its checkbox under a styled label: click the label.
    const chip = this.investmentSection().locator('[data-investment-only-undeclared]')
    const input = chip.getByRole('checkbox', { name: 'Solo no declarados' })
    if ((await input.isChecked()) !== enabled) await chip.click()
    await expect(input).toBeChecked({ checked: enabled })
  }

  /** A close of the Aportes register, by its ISO date. */
  contributionRow(date: string): Locator {
    return this.investmentSection().locator(`tr[data-contribution-date="${date}"]`)
  }

  async setContributionFlowByDate(date: string, flow: number) {
    await this.openInvestmentContributionsTab()
    const input = this.investmentSection().locator(`input[data-contribution-flow-date="${date}"]`)
    await expect(input).toBeVisible()
    await input.fill(String(flow))
    await input.press('Enter')
    await input.blur()
  }

  async getContributionFlowByDate(date: string): Promise<number> {
    await this.openInvestmentContributionsTab()
    const input = this.investmentSection().locator(`input[data-contribution-flow-date="${date}"]`)
    await expect(input).toBeVisible()
    const text = await input.inputValue()
    return Number(text.replace(/\./g, '').replace(',', '.'))
  }

  contributionWorkflow(): Locator {
    return this.page.locator('#contribution-workflow-dialog')
  }

  async openContributionWorkflowModal() {
    await this.openInvestmentContributionsTab()
    await this.investmentSection().getByRole('button', { name: 'Nuevo aporte' }).click()
    await expect(this.contributionWorkflow()).toBeVisible()
  }

  async contributionWorkflowSelectMonth(monthLabel: string) {
    await this.contributionWorkflow()
      .locator('#contribution-workflow-month')
      .selectOption({ label: monthLabel })
  }

  async contributionWorkflowSetDate(date: string) {
    await this.contributionWorkflow().locator('#contribution-workflow-date').fill(date)
  }

  async contributionWorkflowDateValue(): Promise<string> {
    return this.contributionWorkflow().locator('#contribution-workflow-date').inputValue()
  }

  /** A step-1 row: an investment asset or a liquidity account, by name. */
  contributionWorkflowSnapshotRow(kind: 'investments' | 'accounts', name: string): Locator {
    return this.contributionWorkflow().locator(`[data-contribution-snapshot-row="${kind}"]`, {
      hasText: name,
    })
  }

  async contributionWorkflowSetInvestmentSnapshot(assetName: string, value: number) {
    const row = this.contributionWorkflowSnapshotRow('investments', assetName)
    await expect(row).toBeVisible()
    await row.locator('input[data-contribution-snapshot-kind="investments"]').fill(String(value))
  }

  async contributionWorkflowApplySnapshotCalculator(params: {
    type: 'investment' | 'liquidity'
    rowName: string
    expression: string
  }) {
    const row = this.contributionWorkflowSnapshotRow(
      params.type === 'investment' ? 'investments' : 'accounts',
      params.rowName,
    )
    await expect(row).toBeVisible()
    await row.getByRole('button', { name: `Calcular el valor de ${params.rowName}` }).click()
    const calc = row.locator('[data-contribution-calc]')
    await expect(calc).toBeVisible()
    await calc.getByLabel('Cálculo').fill(params.expression)
    await calc.getByRole('button', { name: 'Aplicar al valor' }).click()
    await expect(calc).toBeHidden()
  }

  async contributionWorkflowSetLiquiditySnapshot(accountName: string, value: number) {
    const row = this.contributionWorkflowSnapshotRow('accounts', accountName)
    await expect(row).toBeVisible()
    await row.locator('input[data-contribution-snapshot-kind="accounts"]').fill(String(value))
  }

  async contributionWorkflowGoToAllocationStep() {
    const modal = this.contributionWorkflow()
    await modal.getByRole('button', { name: 'Siguiente: reparto' }).click()
    await expect(modal.locator('#contribution-workflow-step-allocation')).toBeVisible()
  }

  async contributionWorkflowSetTotal(value: number) {
    await this.contributionWorkflow().locator('#contribution-workflow-total').fill(String(value))
  }

  async contributionWorkflowSetAllocation(accountName: string, value: number) {
    const row = this.contributionWorkflow().locator('[data-contribution-allocation-row]', {
      hasText: accountName,
    })
    await expect(row).toBeVisible()
    await row.locator('input[data-contribution-allocation-account-id]').fill(String(value))
  }

  contributionWorkflowSnapshotWarning(): Locator {
    return this.page.locator('#contribution-workflow-snapshot-warning')
  }

  contributionWorkflowAllocationWarning(): Locator {
    return this.page.locator('#contribution-workflow-allocation-warning')
  }

  async contributionWorkflowSave() {
    await this.contributionWorkflow()
      .getByRole('button', { name: /^Guardar (aporte|con avisos)$/ })
      .click()
  }

  async contributionWorkflowPressEnterInInvestmentSnapshot(assetName: string) {
    const row = this.contributionWorkflowSnapshotRow('investments', assetName)
    await expect(row).toBeVisible()
    await row.locator('input[data-contribution-snapshot-kind="investments"]').press('Enter')
  }

  async deleteManualContributionByDate(date: string) {
    await this.openInvestmentContributionsTab()
    const row = this.contributionRow(date)
    await expect(row).toBeVisible()
    await row.locator(`button[data-delete-contribution-date="${date}"]`).click()
    await expect(this.page.locator('#contribution-delete-dialog')).toBeVisible()
  }

  async confirmDeleteManualContribution() {
    const dialog = this.page.locator('#contribution-delete-dialog')
    await dialog.getByRole('button', { name: 'Eliminar aporte' }).click()
  }

  async getInvestmentMovementsOperations(): Promise<string[]> {
    await this.openInvestmentMovementsTab()
    const rows = this.investmentSection().locator('tr[data-investment-tx-id]')
    const count = await rows.count()
    const operations: string[] = []
    for (let index = 0; index < count; index += 1) {
      operations.push((await rows.nth(index).getAttribute('data-investment-operation')) ?? '')
    }
    return operations
  }

  investmentSection(): Locator {
    return this.page.locator('#investment')
  }

  async reload() {
    await this.page.reload()
    await expect(this.page.locator('html[data-finance-ready="true"]')).toBeVisible()
    await expect(this.page.locator('[data-finance-workspace]')).toBeVisible()
  }

  private async openSection(buttonLabel: string, sectionId: string, headingText: string | RegExp) {
    // Callers often reload or navigate right before this; the nav buttons do
    // nothing until the app has booted.
    await expect(this.page.locator('html[data-finance-ready="true"]')).toBeVisible()
    const section = this.page.locator(`#${sectionId}`)
    if (!(await section.isVisible())) {
      await this.clickNavButton(buttonLabel, sectionId)
    }
    await expect(section).toBeVisible()
    await expect(section.getByRole('heading', { name: headingText })).toBeVisible()
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
    const visibleNavButton = this.page.locator(`#nav-tabs [data-section="${sectionId}"]:visible`)
    if ((await visibleNavButton.count()) > 0) {
      await visibleNavButton.first().click()
      return
    }

    const moreTrigger = this.page.locator('#nav-tabs [data-mobile-more-trigger]:visible')
    if ((await moreTrigger.count()) === 0) {
      throw new Error(
        `No visible navigation entry for "${buttonLabel}" (${sectionId}), and no mobile "Más" trigger to open.`,
      )
    }
    await moreTrigger.first().click()
    const moreMenu = this.page.locator('#mobile-more-menu')
    await expect(moreMenu).toBeVisible()
    await moreMenu.locator(`[data-section="${sectionId}"]`).first().click()
    await expect(moreMenu).toBeHidden()
  }

  private async selectByLabelOrFirst(select: Locator, label: string) {
    const options = await select.locator('option').allTextContents()
    if (options.map((item) => item.trim()).includes(label)) {
      await select.selectOption({ label })
      return
    }

    const firstValue = await select.locator('option').first().getAttribute('value')
    if (firstValue) {
      await select.selectOption(firstValue)
    }
  }

  private async ensureTransactionModalOpen() {
    if (!(await this.transactionPanel.isVisible())) {
      await this.transactionsSection.getByRole('tab', { name: /Registro/ }).click()
      await this.transactionsSection.getByRole('button', { name: 'Nuevo movimiento' }).click()
      await expect(this.transactionPanel).toBeVisible()
    }
  }

  private parseMoneyText(value: string): number {
    const cleaned = value
      .replace(/\u00a0/g, '')
      .replace(/[€$£]/g, '')
      .replace(/\./g, '')
      .replace(',', '.')
      .trim()
    const parsed = Number.parseFloat(cleaned)
    if (!Number.isFinite(parsed)) {
      throw new Error(`No se pudo parsear importe: ${value}`)
    }
    return parsed
  }
}

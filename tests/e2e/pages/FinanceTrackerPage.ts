import { expect, type Locator, type Page } from '@playwright/test'
import { setSwitch } from './controls'

/** `--breakpoint-desk` in src/styles/global.css (61.3125rem): sidebar and floating launcher from here up. */
const DESK_BREAKPOINT_PX = 981

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

const MONTH_NUMBER: Record<string, number> = Object.fromEntries(
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
  ].map((name, index) => [name, index + 1]),
)

export class FinanceTrackerPage {
  /** Month the registry band was last moved to, for month-scoped row counts. */
  private transactionsMonth: number | null = null

  constructor(
    private readonly page: Page,
    private readonly options: { preserveWelcome?: boolean } = {},
  ) {}

  /** `<html>`: carries the theme, demo and sidebar state attributes. */
  get appRoot(): Locator {
    return this.page.locator('html')
  }

  /** Hydration and bindings are complete; navigation does nothing before it. */
  async expectReady() {
    await expect(this.page.locator('html[data-finance-ready="true"]')).toBeVisible()
  }

  /** Transient confirmation message of the last action. */
  get toast(): Locator {
    return this.page.locator('#toast')
  }

  /** The conflict dialog ADR 0003 removed: it must never appear. */
  get conflictResolutionDialog(): Locator {
    return this.page.locator('[data-conflict-resolution-dialog]')
  }

  /**
   * The shell's global sync state. It does not confirm one concrete operation:
   * wait for the command's own response (`expectSyncCommand`) for that.
   */
  get syncStatus(): Locator {
    return this.page.locator('#sidebar-sync-status')
  }

  /** A KPI card of the dashboard, with its figure and its change against the previous period. */
  kpi(kind: 'income' | 'expense' | 'investment') {
    const card = this.dashboardSection.locator(`[data-kpi="${kind}"]`)
    return {
      card,
      figure: card.locator(`#kpi-${kind}`),
      change: card.locator('[data-kpi-change]'),
    }
  }

  get netWorthChart(): Locator {
    return this.dashboardSection.locator('#chart-networth')
  }

  get cashflowChart(): Locator {
    return this.page.locator('#chart-cashflow')
  }

  /** The year selector of Configuración. */
  get settingsYear(): Locator {
    return this.section('settings').locator('#settings-year')
  }

  /** The visible entry of the section navigation (sidebar or mobile bar). */
  navItem(sectionId: FinanceSectionId): Locator {
    return this.page.locator(`[data-nav-item][data-section=${sectionId}]:visible`)
  }

  /** The net worth figure inside the dashboard's «Patrimonio neto» band. */
  get netWorthKpi(): Locator {
    return this.dashboardSection
      .getByRole('region', { name: 'Patrimonio neto' })
      .locator('#kpi-net-worth')
  }

  /** Collapses and expands the desktop sidebar. */
  get sidebarToggle(): Locator {
    return this.page.locator('#sidebar-toggle')
  }

  /** Top bar of the mobile layout. */
  get mobileAppBar(): Locator {
    return this.page.locator('[data-mobile-app-bar]')
  }

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

  /** The scrolling body of the movement side panel. */
  get transactionPanelBody(): Locator {
    return this.transactionPanel.locator('[data-side-panel-body]')
  }

  /** Scrolls the movement panel body to its end. */
  async scrollTransactionPanelToBottom() {
    const body = this.transactionPanelBody
    await body.evaluate((element) => {
      element.scrollTop = element.scrollHeight
    })
    await expect.poll(() => body.evaluate((element) => element.scrollTop)).toBeGreaterThan(0)
  }

  /** Asserts the movement panel opened at the top of the form. */
  async expectTransactionPanelAtTop() {
    await expect(this.transactionPanelBody).toHaveJSProperty('scrollTop', 0)
    await expect(
      this.transactionPanel.getByRole('group', { name: 'Tipo de movimiento' }),
    ).toBeInViewport()
    await expect(this.transactionPanel.getByLabel('Importe')).toBeInViewport()
  }

  /** The compact «Nuevo movimiento» launcher of the registry. */
  get newTransactionLauncher(): Locator {
    return this.transactionsSection.locator('#tx-open-modal')
  }

  /** Net of the month in the registry's summary. */
  get transactionsMonthNet(): Locator {
    return this.transactionsSection.locator('#tx-month-net')
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

  /** Changes the monthly snapshot would record. */
  get snapshotChanges(): Locator {
    return this.wealthSection.locator('[data-snapshot-changes]')
  }

  get saveSnapshotButton(): Locator {
    return this.wealthSection.locator('[data-save-snapshot]')
  }

  get goalsSection(): Locator {
    return this.page.locator('#goals')
  }

  /** The saving goal summary of the dashboard. */
  get savingsGoalSummary(): Locator {
    return this.dashboardSection.locator('#savings-goal')
  }

  get savingGoalsEmpty(): Locator {
    return this.goalsSection.locator('[data-saving-goals-empty]')
  }

  get savingGoalRows(): Locator {
    return this.goalsSection.locator('[data-saving-goal-row]')
  }

  /** Side panel that creates a saving goal. */
  get savingGoalPanel(): Locator {
    return this.page.locator('#saving-goal-panel')
  }

  /** One category list of Configuración → Categorías (`expenseCategories`, `savingCategories`...). */
  categoryList(kind: string): Locator {
    return this.section('settings').locator(`[data-category-list="${kind}"]`)
  }

  /** The categories of a list, or one by name. */
  categoryItem(list: Locator, name?: string): Locator {
    return list.locator(name === undefined ? '[data-category]' : `[data-category="${name}"]`)
  }

  get dataSection(): Locator {
    return this.page.locator('#data')
  }

  get dataMeta(): Locator {
    return this.dataSection.locator('#data-meta')
  }

  /** The side panel of an account or asset in Configuración. */
  get settingsAccountPanel(): Locator {
    return this.page.locator('#settings-account-panel')
  }

  /** The panel of the «Cuentas» tab of Configuración. */
  get settingsAccountsTabPanel(): Locator {
    return this.section('settings').locator('#settings-tab-accounts')
  }

  /** Total of the wealth band for the selected month. */
  get wealthTotal(): Locator {
    return this.wealthSection.locator('[data-wealth-band]').locator('#wealth-total')
  }

  get issueReportDialog(): Locator {
    return this.page.getByRole('dialog', { name: 'Crear reporte' })
  }

  get issueReportNotice(): Locator {
    return this.issueReportDialog.locator('#issue-report-notice')
  }

  get issueReportAttachments(): Locator {
    return this.issueReportDialog.locator('#issue-report-attachments')
  }

  get issueReportAttachmentList(): Locator {
    return this.issueReportDialog.locator('#issue-report-attachment-list')
  }

  get reportsPage(): Locator {
    return this.page.locator('#reports')
  }

  /** A report in the «Mis reportes» list, by its issue number. */
  reportEntry(issueNumber: number): Locator {
    return this.page.locator(`[data-report-entry="${issueNumber}"]`)
  }

  /** One message of an open report's thread. */
  reportThreadItem(detail: Locator, id: number): Locator {
    return detail.locator(`[data-thread-item="${id}"]`)
  }

  /** Abre «Mis reportes» por su ruta real (fuera de las secciones). */
  async openReports(issueNumber?: number) {
    await this.page.goto(`/reportes${issueNumber ? `?reporte=${issueNumber}` : ''}`)
    await this.expectReady()
    await expect(
      this.reportsPage.getByRole('heading', { name: 'Mis reportes', exact: true }),
    ).toBeVisible()
  }

  async goto() {
    await this.page.goto('/')
    await this.expectReady()
    await this.dismissWelcomeIfNeeded()
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

  /** The «Suscripciones» tab content of Movimientos. */
  get subscriptionsTab(): Locator {
    return this.transactionsSection.locator('#transactions-tab-subscriptions')
  }

  get subscriptionsTotal(): Locator {
    return this.subscriptionsTab.locator('[data-subscriptions-total]')
  }

  subscriptionRow(name: string): Locator {
    return this.subscriptionsTab.locator('tr[data-subscription-id]', { hasText: name })
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

  /** The hidden file input that starts a backup import in Datos. */
  get importFileInput(): Locator {
    return this.page.locator('#import-json')
  }

  /** Picks a backup file in Datos, which opens the import confirmation. */
  async chooseImportFile() {
    await this.importFileInput.setInputFiles({
      name: 'finance-tracker-copia.json',
      mimeType: 'application/json',
      buffer: Buffer.from('{}'),
    })
    await expect(
      this.page.getByRole('alertdialog', { name: '¿Importar esta copia?' }),
    ).toBeVisible()
  }

  /** The floating launcher of the issue report, from the `desk` breakpoint up. */
  get globalReportTrigger(): Locator {
    return this.page.locator('#global-report-trigger')
  }

  /** Dot on the launcher when a report has updates. */
  get globalReportUpdates(): Locator {
    return this.globalReportTrigger.locator('[data-reports-updates]')
  }

  /** The floating launcher from the `desk` breakpoint up; the «Más» sheet below it. */
  async openGlobalReportDialog() {
    if ((this.page.viewportSize()?.width ?? 0) >= DESK_BREAKPOINT_PX) {
      await this.globalReportTrigger.click()
    } else {
      await this.page.getByRole('button', { name: 'Más secciones' }).click()
      await this.page
        .getByRole('dialog', { name: 'Más secciones' })
        .getByRole('button', { name: 'Crear reporte' })
        .click()
    }
    await expect(this.issueReportDialog).toBeVisible()
  }

  async submitIssueReport(params: {
    // Only the two options the «Tipo» control renders. The wider `ReportType`
    // in `src/services/issue-report-api.ts` still allows "enhancement", but
    // the UI dropped it.
    type: 'bug' | 'feature'
    summary: string
    description?: string
  }) {
    await this.openGlobalReportDialog()
    const panel = this.issueReportDialog
    await panel
      .getByRole('group', { name: 'Tipo' })
      .getByRole('button', { name: params.type === 'bug' ? 'Error' : 'Mejora' })
      .click()
    await panel.getByLabel('Resumen').fill(params.summary)
    if (params.description !== undefined) {
      await panel.getByLabel('Descripción').fill(params.description)
    }
    await panel.getByRole('button', { name: 'Crear reporte' }).click()
  }

  issueReportStatus(): Locator {
    return this.issueReportDialog.getByRole('status')
  }

  async open(sectionId: FinanceSectionId) {
    const sectionConfig = SECTION_CONFIG[sectionId]
    await this.openSection(sectionConfig.buttonLabel, sectionId, sectionConfig.headingText)
  }

  /** Clicks a section's nav entry even when that section is already active. */
  async clickNav(sectionId: FinanceSectionId) {
    await this.clickNavButton(SECTION_CONFIG[sectionId].buttonLabel, sectionId)
  }

  /** Scrolls the document to the bottom, as reading a long section does. */
  async scrollToPageBottom() {
    await this.scrollToPageY(await this.maxScrollY())
  }

  /** Highest vertical offset the current section's document can reach. */
  async maxScrollY(): Promise<number> {
    return this.page.evaluate(() => document.documentElement.scrollHeight - window.innerHeight)
  }

  async scrollToPageY(top: number) {
    await this.page.evaluate((offset) => {
      window.scrollTo(0, offset)
    }, top)
  }

  async scrollY(): Promise<number> {
    return this.page.evaluate(() => window.scrollY)
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

  /** The form controls of the investment movement panel. */
  investmentMovementFields(panel: Locator = this.investmentMovementPanel()) {
    return {
      date: panel.locator('#investment-movement-date'),
      time: panel.locator('#investment-movement-time'),
      symbol: panel.locator('#investment-movement-symbol'),
      unitPrice: panel.locator('#investment-movement-unit-price'),
      units: panel.locator('#investment-movement-units'),
      fee: panel.locator('#investment-movement-fee'),
      currency: panel.locator('#investment-movement-currency'),
      broker: panel.locator('#investment-movement-broker'),
      category: panel.locator('#investment-movement-category'),
      side: (side: 'buy' | 'sell') => panel.locator(`[data-investment-side="${side}"]`),
    }
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

  /** Every row of the investment movements ledger. */
  get investmentMovementRows(): Locator {
    return this.investmentSection().locator('tr[data-investment-tx-id]')
  }

  /** Stylesheet the `@snapshot` fixture injects to pin the fonts. */
  get snapshotFontStyle(): Locator {
    return this.page.locator('style[data-snapshot-fonts]')
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
    const fields = this.investmentMovementFields(section)
    await fields.date.fill(params.date)
    await fields.time.fill(params.time)
    await fields.side(params.side).click()
    await fields.symbol.fill(params.symbol)
    await fields.unitPrice.fill(String(params.unitPrice))
    await fields.units.fill(String(params.units))
    await fields.fee.fill(String(params.fee))
    if (params.movementCurrency) {
      await fields.currency.fill(params.movementCurrency)
    }
    await this.selectByLabelOrFirst(fields.broker, params.brokerName || 'Revolut')
    if (params.category !== undefined) {
      const categorySelect = fields.category
      if (!(await categorySelect.isDisabled())) {
        await this.selectByLabelOrFirst(categorySelect, params.category)
      }
    }

    await setSwitch(
      section.getByRole('switch', { name: 'Ya está declarado' }),
      Boolean(params.declared),
    )

    const stockEventsCashInput = section.getByRole('switch', { name: /efectivo en Stock Events/ })
    if (params.stockEventsCash && (await stockEventsCashInput.count()) > 0) {
      await setSwitch(stockEventsCashInput, true)
    }

    await section.getByRole('button', { name: 'Guardar movimiento' }).click()
    await expect(this.page.getByRole('status')).toContainText('Movimiento de inversión guardado.')
    await expect(section).toBeHidden()
  }

  async addAccount(params: { name: string; openingBalance?: number }) {
    await this.openSettingsTab('Cuentas')
    await this.section('settings').getByRole('button', { name: 'Nueva cuenta' }).click()
    const panel = this.settingsAccountPanel
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
      await setSwitch(toggle, enabled)
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

  /** Deletes the selection, confirming the dialog that names how many go. */
  async deleteSelectedTransactions(count: number) {
    await this.bulkActionBar.getByRole('button', { name: 'Eliminar' }).click()
    const label = `${count} ${count === 1 ? 'movimiento' : 'movimientos'}`
    const dialog = this.page.getByRole('alertdialog', { name: `¿Eliminar ${label}?` })
    await expect(dialog).toBeVisible()
    await dialog.getByRole('button', { name: `Eliminar ${label}` }).click()
    await expect(dialog).toBeHidden()
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
    const target = MONTH_NUMBER[monthLabel.toLowerCase()]
    const title = this.transactionsSection.locator('#tx-month-title')
    for (let step = 0; step < 24; step += 1) {
      const text = ((await title.textContent()) ?? '').toLowerCase()
      const current = Object.keys(MONTH_NUMBER).find((name) => text.includes(` ${name} `))
      if (current === undefined) {
        throw new Error(`No se pudo leer el mes de la franja: ${text}`)
      }
      const delta = target - MONTH_NUMBER[current]
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

  get typeChipGroup(): Locator {
    return this.registryToolbar.getByRole('group', { name: 'Filtrar por tipo' })
  }

  /** Checkbox of a type chip, for asserting whether the filter is on. */
  typeChip(label: string): Locator {
    return this.typeChipGroup.getByRole('checkbox', { name: label })
  }

  get transactionSearch(): Locator {
    return this.registryToolbar.getByLabel('Buscar movimientos')
  }

  /** Turns a type chip of the registry toolbar on or off. */
  async setTransactionTypeChip(label: string, on: boolean) {
    const chip = this.typeChipGroup.locator('label', { hasText: label })
    if ((await this.typeChip(label).isChecked()) !== on) {
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
    for (const label of ['Ingresos', 'Gastos', 'Ahorros', 'Inversión']) {
      await this.setTransactionTypeChip(label, false)
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

  /** Picks the budget tab (Gastos, Ingresos, Ahorro, Inversión). */
  async openBudgetTab(type: 'income' | 'expense' | 'saving' | 'investment') {
    await this.openBudget()
    await this.budgetTab(type).click()
  }

  budgetTab(type: 'income' | 'expense' | 'saving' | 'investment'): Locator {
    return this.budgetSection.locator(`[data-budget-tab="${type}"]`)
  }

  /** Picks how many months the budget table shows. */
  async selectBudgetRange(range: '3' | '6' | '12') {
    await this.budgetSection.locator(`[data-budget-range="${range}"]`).click()
    await expect(this.budgetSection.locator(`section[data-budget-months="${range}"]`)).toBeVisible()
  }

  /** The budget field of a category and month; the year view shows every month. */
  budgetInput(category: string, monthLabel: string): Locator {
    return this.budgetSection.getByRole('textbox', {
      name: `Presupuesto de ${category} en ${monthLabel.toLowerCase()}`,
    })
  }

  async setBudgetValue(params: {
    typeValue: 'income' | 'expense' | 'investment'
    monthLabel: string
    categoryLabel: string
    plannedValue: string
  }) {
    await this.openBudgetTab(params.typeValue)
    await this.selectBudgetRange('12')
    const input = this.budgetInput(params.categoryLabel, params.monthLabel)
    await input.fill(params.plannedValue)
    await input.press('Tab')
  }

  async getBudgetValue(params: {
    typeValue: 'income' | 'expense' | 'investment'
    monthLabel: string
    categoryLabel: string
  }): Promise<string> {
    await this.openBudgetTab(params.typeValue)
    await this.selectBudgetRange('12')
    return this.budgetInput(params.categoryLabel, params.monthLabel).inputValue()
  }

  /** Opens the year plan of a category from its name in the budget table. */
  async openBudgetPlan(category: string): Promise<Locator> {
    await this.openBudget()
    await this.budgetSection
      .getByRole('button', { name: `Planificar los doce meses de ${category}` })
      .click()
    const panel = this.page.getByRole('dialog', { name: category })
    await expect(panel).toBeVisible()
    return panel
  }

  /** Picks a month in the band's month strip ("MARZO" or "marzo"). */
  async selectWealthMonth(monthLabel: string) {
    const month = MONTH_NUMBER[monthLabel.toLowerCase()]
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
    await this.saveSnapshot()
    await this.waitForSync()
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
    await this.saveSnapshotButton.click()
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
      await setSwitch(panel.getByRole('switch', { name: 'Ya está declarado' }), payload.declared)
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

  get contributionRows(): Locator {
    return this.investmentSection().locator('tr[data-contribution-date]')
  }

  contributionDeleteButton(date: string): Locator {
    return this.investmentSection().locator(`button[data-delete-contribution-date="${date}"]`)
  }

  get contributionDeleteDialog(): Locator {
    return this.page.locator('#contribution-delete-dialog')
  }

  async setContributionFlowByDate(date: string, flow: number) {
    await this.openInvestmentContributionsTab()
    const input = this.contributionFlowInput(date)
    await expect(input).toBeVisible()
    await input.fill(String(flow))
    await input.press('Enter')
    await input.blur()
  }

  async getContributionFlowByDate(date: string): Promise<number> {
    await this.openInvestmentContributionsTab()
    const input = this.contributionFlowInput(date)
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
    await this.contributionWorkflowDateInput.fill(date)
  }

  async contributionWorkflowDateValue(): Promise<string> {
    return this.contributionWorkflowDateInput.inputValue()
  }

  /** A step-1 row: an investment asset or a liquidity account, by name. */
  contributionWorkflowSnapshotRow(kind: 'investments' | 'accounts', name: string): Locator {
    return this.contributionWorkflow().locator(`[data-contribution-snapshot-row="${kind}"]`, {
      hasText: name,
    })
  }

  /** The balance input of one asset or account row in the guided contribution's snapshot step. */
  contributionWorkflowSnapshotInput(kind: 'investments' | 'accounts', name: string): Locator {
    return this.contributionWorkflowSnapshotRow(kind, name).locator(
      `input[data-contribution-snapshot-kind="${kind}"]`,
    )
  }

  /** Every row of one kind in the snapshot step. */
  contributionWorkflowSnapshotRows(kind: 'investments' | 'accounts'): Locator {
    return this.contributionWorkflow().locator(`[data-contribution-snapshot-row="${kind}"]`)
  }

  get contributionWorkflowSnapshotStep(): Locator {
    return this.contributionWorkflow().locator('#contribution-workflow-step-snapshot')
  }

  get contributionWorkflowDateInput(): Locator {
    return this.contributionWorkflow().locator('#contribution-workflow-date')
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

  /** The content of one Inversión tab (it exists in the DOM even while hidden). */
  investmentTabPanel(tab: 'dashboard' | 'movements' | 'contributions'): Locator {
    return this.investmentSection().locator(`#investment-tab-${tab}`)
  }

  /** The positions listed in Inversión; clicking one opens its asset chart. */
  get investmentPositions(): Locator {
    return this.investmentSection().locator('[data-position]')
  }

  /** Label and figure of the return KPI (TWR or simple), and the portfolio's total value. */
  get returnLabel(): Locator {
    return this.investmentSection().locator('#inv-return-label')
  }

  get returnFigure(): Locator {
    return this.returnLabel.locator('..').locator('#inv-return')
  }

  get totalValue(): Locator {
    return this.investmentSection().locator('#inv-total-value')
  }

  get portfolioChart(): Locator {
    return this.page.locator('#investment-portfolio-chart')
  }

  /** The allocation bar, and its segments (one per position). */
  get allocationBar(): Locator {
    return this.page.locator('#investment-allocation')
  }

  get allocationSegments(): Locator {
    return this.allocationBar.locator('[data-segment]')
  }

  /** The month selector of the investment charts. */
  get investmentMonthSelect(): Locator {
    return this.page.locator('#investment-month')
  }

  get assetChart(): Locator {
    return this.page.locator('#investment-asset-chart')
  }

  /** Header texts of the Aportes register. */
  async contributionHeaders(): Promise<string[]> {
    const headers = await this.investmentTabPanel('contributions')
      .locator('thead th')
      .allTextContents()
    return headers.map((value) => value.trim())
  }

  /** A figure of one Aportes row; `flow` is its editable contribution input. */
  contributionCell(
    row: Locator,
    cell: 'value' | 'nav' | 'period' | 'cumulative' | 'origin' | 'flow',
  ): Locator {
    return row.locator(
      cell === 'flow' ? 'input[data-contribution-flow-date]' : `[data-contribution-${cell}]`,
    )
  }

  /** The editable flow input of the Aportes row of this date. */
  contributionFlowInput(date: string): Locator {
    return this.investmentSection().locator(`input[data-contribution-flow-date="${date}"]`)
  }

  get contributionSummary(): Locator {
    return this.investmentSection().locator('[data-contribution-summary]')
  }

  get contributionNavChart(): Locator {
    return this.investmentSection().locator('#contribution-nav-chart')
  }

  async reload() {
    await this.page.reload()
    await this.expectReady()
    await this.dismissWelcomeIfNeeded()
    await expect(this.page.locator('[data-finance-workspace]')).toBeVisible()
  }

  async dismissWelcomeIfNeeded() {
    if (this.options.preserveWelcome) return
    const welcome = this.page.getByRole('dialog', { name: 'Bienvenido a tus finanzas' })
    // Readiness precedes the welcome island's watcher. Wait for its decision
    // rather than racing an isVisible() check against the first presentation.
    await expect
      .poll(async () => {
        if (await welcome.isVisible()) return true
        if (await this.page.getByRole('button', { name: 'Retomar bienvenida' }).isVisible())
          return true
        return (await this.page.locator('[data-welcome-state="complete"]').count()) > 0
      })
      .toBe(true)
    if (await welcome.isVisible()) {
      await welcome.getByRole('button', { name: /^(Ahora no|Entendido)$/ }).click()
      await expect(welcome).toBeHidden()
    }
  }

  /** The shell's durable-intent surface: the first failed action, with retry/discard. */
  get intentStatus(): Locator {
    return this.page.locator('#sidebar-intent-status')
  }

  /** Opens the user menu, where the shell shows the first failed durable action. */
  async openUserMenu(): Promise<void> {
    await this.page.getByRole('button', { name: 'Abrir menú de usuario' }).click()
  }

  /** Discards the failed durable action the sidebar is currently showing. */
  async discardIntentFromSidebar(): Promise<void> {
    await expect(this.intentStatus).toBeVisible()
    await this.intentStatus.getByRole('button', { name: 'Descartar' }).click()
  }

  async waitForSync() {
    const status = this.syncStatus
    await expect(status).toContainText('Sincronizado', { timeout: 15000 })
    await this.page.waitForLoadState('networkidle')
    await expect(status).toContainText('Sincronizado', { timeout: 15000 })
  }

  private async openSection(buttonLabel: string, sectionId: string, headingText: string | RegExp) {
    // Callers often reload or navigate right before this; the nav buttons do
    // nothing until the app has booted.
    await this.expectReady()
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
      .replace(/\u2212/g, '-')
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

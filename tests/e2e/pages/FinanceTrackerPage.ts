import { expect, type Locator, type Page } from '@playwright/test'
import { typeOnKeypad } from '../entry-keypad'

/** `--breakpoint-frame` in src/neon/styles/neon.css (61.3125rem): sidebar from here up. */
const FRAME_BREAKPOINT_PX = 981

const SECTION_CONFIG = {
  // «Dashboard» on desktop; the mobile frame names the month over the figure
  // («Te quedan en octubre»).
  dashboard: {
    buttonLabel: 'Dashboard',
    headingText: /^(Dashboard|Te (quedan|quedaron) en \S+)$/,
  },
  transactions: { buttonLabel: 'Movimientos', headingText: /^Movimientos$/ },
  budget: { buttonLabel: 'Presupuesto', headingText: 'Presupuesto' },
  wealth: { buttonLabel: 'Patrimonio', headingText: /^Patrimonio$/ },
  investment: { buttonLabel: 'Inversión', headingText: /^Inversión$/ },
  goals: { buttonLabel: 'Objetivos', headingText: 'Objetivos' },
  settings: { buttonLabel: 'Configuración', headingText: /^Configuración$/ },
  data: { buttonLabel: 'Datos', headingText: /^Datos$/ },
} as const

export type FinanceSectionId = keyof typeof SECTION_CONFIG

const TX_TYPE_LABEL = {
  income: 'Ingreso',
  expense: 'Gasto',
  saving: 'Ahorro',
  investment: 'Inversión',
} as const

/** "FEBRERO" → "Febrero", as the month picker names it. */
function monthOptionLabel(monthLabel: string): string {
  const lower = monthLabel.toLowerCase()
  return lower.charAt(0).toUpperCase() + lower.slice(1)
}

/** "2026-01-31" → "31/01/2026", as the date picker's text field reads it. */
function typedDate(isoDate: string): string {
  const [year, month, day] = isoDate.split('-')
  return `${day}/${month}/${year}`
}

export class FinanceTrackerPage {
  constructor(
    private readonly page: Page,
    private readonly options: { preserveSetup?: boolean; preserveTour?: boolean } = {},
  ) {}

  get dashboardSection(): Locator {
    return this.page.locator('#dashboard')
  }

  get transactionsSection(): Locator {
    return this.page.locator('#transactions')
  }

  get budgetSection(): Locator {
    return this.page.locator('#budget')
  }

  get wealthSection(): Locator {
    return this.page.locator('#wealth')
  }

  get investmentSection(): Locator {
    return this.page.locator('#investment')
  }

  get issueReportDialog(): Locator {
    return this.page.getByRole('dialog', { name: 'Crear reporte' })
  }

  get reportsPage(): Locator {
    return this.page.locator('#reports')
  }

  /** The «Apuntar» sheet (a new movement, or a new investment from Inversión). */
  get entrySheet(): Locator {
    return this.page.getByRole('dialog', { name: /^(Nuevo movimiento|Nueva inversión)$/ })
  }

  /** Rows of the registry, every month shown. */
  get transactionRows(): Locator {
    return this.transactionsSection.locator('[data-tx-ledger] [data-tx-id]')
  }

  transactionRow(description: string): Locator {
    return this.transactionRows.filter({ hasText: description }).first()
  }

  /** The detail panel of a movement, titled with its description. */
  transactionDetail(description: string): Locator {
    return this.page.getByRole('dialog', { name: description })
  }

  /** Abre «Mis reportes» por su ruta real (fuera de las secciones). */
  async openReports(issueNumber?: number) {
    await this.page.goto(`/reportes${issueNumber ? `?reporte=${issueNumber}` : ''}`)
    await expect(this.page.locator('html[data-finance-ready="true"]')).toBeVisible()
    await expect(
      this.reportsPage.getByRole('heading', { name: 'Mis reportes', exact: true }),
    ).toBeVisible()
  }

  async goto() {
    await this.page.goto('/')
    await expect(this.page.locator('html[data-finance-ready="true"]')).toBeVisible()
    await this.dismissIntroIfNeeded()
    await expect(
      this.dashboardSection.getByRole('heading', { name: SECTION_CONFIG.dashboard.headingText }),
    ).toBeVisible()
  }

  async reload() {
    await this.page.reload()
    await expect(this.page.locator('html[data-finance-ready="true"]')).toBeVisible()
    await this.dismissIntroIfNeeded()
    await expect(this.page.locator('[data-finance-workspace]')).toBeVisible()
  }

  async logout() {
    await this.page.getByRole('button', { name: 'Abrir menú de usuario' }).click()
    await this.page.getByRole('menuitem', { name: /Cerrar sesión/ }).click()
  }

  async open(sectionId: FinanceSectionId) {
    const { buttonLabel, headingText } = SECTION_CONFIG[sectionId]
    // Callers often reload or navigate right before this; the nav buttons do
    // nothing until the app has booted.
    await expect(this.page.locator('html[data-finance-ready="true"]')).toBeVisible()
    const section = this.section(sectionId)
    if (!(await section.isVisible())) {
      await this.clickNavButton(buttonLabel, sectionId)
    }
    await expect(section).toBeVisible()
    await expect(section.getByRole('heading', { name: headingText }).first()).toBeVisible()
  }

  async openDashboard() {
    await this.open('dashboard')
  }

  async openTransactions() {
    await this.open('transactions')
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

  async openGoals() {
    await this.open('goals')
  }

  async openSettings() {
    await this.open('settings')
  }

  async openData() {
    await this.open('data')
  }

  section(sectionId: FinanceSectionId): Locator {
    return this.page.locator(`#${sectionId}`)
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

  /** The frame's «Reportar» from the frame breakpoint up; the «Más» sheet below it. */
  async openGlobalReportDialog() {
    if ((this.page.viewportSize()?.width ?? 0) >= FRAME_BREAKPOINT_PX) {
      await this.page.locator('#global-report-trigger').click()
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

  /**
   * Opens the entry sheet: the FAB on the mobile frame; on desktop the
   * header button of Inversión («Nueva operación») when it is the section on
   * screen, else that of Movimientos («Nuevo movimiento»).
   */
  async openEntrySheet() {
    await expect(this.page.locator('html[data-finance-ready="true"]')).toBeVisible()
    const fab = this.page.locator('[data-fab-apuntar]')
    if (await fab.isVisible()) {
      await fab.click()
    } else if (await this.investmentSection.isVisible()) {
      await this.investmentSection.getByRole('button', { name: 'Nueva operación' }).click()
    } else {
      await this.openTransactions()
      await this.transactionsSection.getByRole('button', { name: 'Nuevo movimiento' }).click()
    }
    await expect(this.entrySheet).toBeVisible()
  }

  /** Picks an option of one of the sheet's pickers (Cuenta, Categoría, Broker…). */
  private async pickEntryOption(label: string, option: string) {
    await this.entrySheet.getByRole('button', { name: label, exact: true }).click()
    const picker = this.entrySheet.getByRole('dialog', { name: label, exact: true })
    await expect(picker).toBeVisible()
    // A category may also sit among the recent ones: the full list comes last.
    await picker.getByRole('button', { name: option, exact: true }).last().click()
    await expect(picker).toBeHidden()
  }

  /** Types a date in the sheet's date picker. */
  private async pickEntryDate(isoDate: string) {
    await this.entrySheet.getByRole('button', { name: 'Fecha', exact: true }).click()
    const calendar = this.entrySheet.getByRole('dialog', { name: 'Fecha', exact: true })
    const field = calendar.getByRole('textbox', { name: 'Escribir fecha' })
    // Opening moves focus to the calendar's day; typing before that races with it.
    await expect(calendar.locator('[data-picker-focus]')).toBeFocused()
    await field.fill(typedDate(isoDate))
    await expect(field).toHaveValue(typedDate(isoDate))
    await field.press('Enter')
    await expect(calendar).toBeHidden()
  }

  /**
   * Records a movement from the entry sheet: on the mobile frame with its
   * keypad and blocks, on desktop with its fields. `accountLabel` keeps the
   * sheet's account when it is not given.
   */
  async addCustomTransaction(params: {
    date: string
    monthLabel: string
    type: keyof typeof TX_TYPE_LABEL
    categoryLabel: string
    amount: number
    description: string
    accountLabel?: string
  }) {
    await this.openEntrySheet()
    const sheet = this.entrySheet
    const month = monthOptionLabel(params.monthLabel)
    const pad = await sheet.getByRole('group', { name: 'Teclado del importe' }).isVisible()
    await sheet.getByRole('radio', { name: TX_TYPE_LABEL[params.type], exact: true }).click()
    if (pad) {
      await typeOnKeypad(sheet, String(params.amount).replace('.', ','))
    } else {
      await sheet.getByRole('textbox', { name: 'Importe' }).fill(String(params.amount))
    }
    if (params.accountLabel) await this.pickEntryOption('Cuenta', params.accountLabel)
    await this.pickEntryOption('Categoría', params.categoryLabel)
    await sheet.getByLabel(pad ? 'Nota' : 'Descripción').fill(params.description)
    if (pad) {
      // The date block also holds the accounting month, after the date sets it.
      await this.pickEntryDate(params.date)
      await sheet.getByRole('button', { name: 'Fecha', exact: true }).click()
      const calendar = sheet.getByRole('dialog', { name: 'Fecha', exact: true })
      await calendar
        .getByRole('combobox', { name: 'Cuenta en el mes' })
        .selectOption({ label: month })
      await this.page.keyboard.press('Escape')
      await expect(calendar).toBeHidden()
    } else {
      await sheet.getByText('Fecha y mes contable').click()
      await this.pickEntryDate(params.date)
      await this.pickEntryOption('Cuenta en el mes', month)
    }
    await sheet.getByRole('button', { name: /^Guardar/ }).click()
    await expect(sheet).toBeHidden()
  }

  /** Records a buy or a sale from «Apuntar» inside Inversión. */
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
  }) {
    await this.openInvestment()
    await this.openEntrySheet()
    const sheet = this.entrySheet
    await sheet
      .getByRole('radiogroup', { name: 'Operación' })
      .getByRole('radio', { name: params.side === 'buy' ? 'Compra' : 'Venta' })
      .click()
    await sheet.getByLabel('Símbolo').fill(params.symbol)
    if (params.movementCurrency) await sheet.getByLabel('Moneda').fill(params.movementCurrency)
    await sheet.getByLabel('Títulos').fill(String(params.units))
    await sheet.getByLabel('Precio', { exact: true }).fill(String(params.unitPrice))
    await sheet.getByLabel('Comisión').fill(String(params.fee))
    if (params.brokerName) await this.pickEntryOption('Broker', params.brokerName)
    if (params.category) await this.pickEntryOption('Categoría', params.category)
    await this.pickEntryDate(params.date)
    await sheet.getByLabel('Hora').fill(params.time)
    await sheet.getByRole('button', { name: 'Guardar' }).click()
    await expect(sheet).toBeHidden()
  }

  /** Adds a cash account from the accounts ledger of Configuración. */
  async addAccount(params: { name: string; openingBalance?: number }) {
    await this.openSettings()
    const settings = this.section('settings')
    await settings.getByLabel('Nombre de la nueva cuenta').fill(params.name)
    await settings
      .getByLabel('Saldo inicial de la nueva cuenta')
      .fill(String(params.openingBalance ?? 0))
    await settings.getByRole('button', { name: 'Añadir' }).first().click()
    await expect(
      settings.getByRole('button', { name: `Eliminar ${params.name}`, exact: true }),
    ).toBeVisible()
  }

  /** Unfolds the months the registry keeps behind «Ver … y anteriores». */
  async revealOlderTransactions() {
    const more = this.transactionsSection.getByRole('button', { name: /^Ver .+ y anteriores/ })
    if (await more.isVisible()) {
      await more.click()
    }
  }

  async expectTransactionDescriptionVisible(description: string) {
    await this.openTransactions()
    await this.revealOlderTransactions()
    await expect(this.transactionRow(description)).toBeVisible()
  }

  /** Opens a movement's detail from the registry and edits it there. */
  async editTransactionByDescription(
    description: string,
    payload: { amount?: number; category?: string; newDescription?: string; date?: string },
  ) {
    await this.openTransactions()
    await this.revealOlderTransactions()
    const row = this.transactionRow(description)
    await expect(row).toBeVisible()
    await row.click()

    const panel = this.transactionDetail(description)
    await expect(panel).toBeVisible()
    await panel.getByRole('button', { name: 'Editar' }).click()
    if (payload.date) await panel.getByLabel('Fecha').fill(payload.date)
    if (typeof payload.amount === 'number') {
      await panel.getByLabel('Importe').fill(String(payload.amount))
    }
    if (typeof payload.category === 'string') {
      await panel.getByLabel('Categoría').selectOption({ label: payload.category })
    }
    if (typeof payload.newDescription === 'string') {
      await panel.getByLabel('Descripción').fill(payload.newDescription)
    }
    await panel.getByRole('button', { name: 'Guardar' }).click()

    const saved = this.transactionDetail(payload.newDescription ?? description)
    await expect(saved.getByRole('button', { name: 'Editar' })).toBeVisible()
    await this.page.keyboard.press('Escape')
    await expect(saved).toBeHidden()
  }

  async openSubscriptionsTab() {
    await this.openTransactions()
    await this.transactionsSection.getByRole('tab', { name: /^Suscripciones/ }).click()
  }

  /** The subscription detail panel: a form when new or edited, else its name. */
  subscriptionPanel(name: string | RegExp = /^(Nueva|Editar) suscripción$/): Locator {
    return this.page.getByRole('dialog', { name })
  }

  async openNewSubscriptionPanel() {
    await this.openSubscriptionsTab()
    await this.transactionsSection.getByRole('button', { name: 'Nueva suscripción' }).click()
    await expect(this.subscriptionPanel('Nueva suscripción')).toBeVisible()
  }

  async addSubscription(params: {
    name: string
    amount: number
    categoryLabel: string
    frequency: 'weekly' | 'monthly' | 'quarterly' | 'yearly'
    firstChargeDate: string
  }) {
    await this.openNewSubscriptionPanel()
    const panel = this.subscriptionPanel('Nueva suscripción')
    await panel.getByLabel('Nombre').fill(params.name)
    await panel.getByLabel('Importe').fill(String(params.amount))
    await panel.getByLabel('Frecuencia').selectOption(params.frequency)
    await panel.getByLabel('Categoría').selectOption({ label: params.categoryLabel })
    await panel.getByLabel('Primer cobro').fill(params.firstChargeDate)
    await panel.getByRole('button', { name: 'Guardar' }).click()
    await expect(panel).toBeHidden()
  }

  /** Closes the setup wizard and skips the guided tour that follows it, unless preserved. */
  async dismissIntroIfNeeded() {
    // Readiness precedes the setup island's watcher. Wait for its decision
    // rather than racing an isVisible() check against the first presentation.
    const state = this.page.locator('[data-setup-state]')
    await expect(state).not.toHaveAttribute('data-setup-state', 'loading')
    if ((await state.getAttribute('data-setup-state')) === 'open') {
      if (this.options.preserveSetup) return
      const setup = this.page.locator('dialog[data-setup]')
      await setup.getByRole('button', { name: 'Ahora no' }).first().click()
      await expect(setup).toBeHidden()
    }
    if (this.options.preserveTour) return
    const tour = this.page.locator('[data-tour-state]')
    await expect(tour).not.toHaveAttribute('data-tour-state', 'waiting')
    if ((await tour.getAttribute('data-tour-state')) === 'open') {
      await this.page.getByRole('button', { name: 'Saltar el recorrido' }).click()
      await expect(tour).toHaveAttribute('data-tour-state', 'idle')
    }
  }

  /**
   * The shell's global sync state (in the user menu). It does not confirm one
   * concrete operation: wait for the command's own response for that.
   */
  get syncStatus(): Locator {
    return this.page.locator('#sidebar-sync-status')
  }

  /** «Por confirmar» in the app bar of whichever frame is showing. */
  get pendingTrigger(): Locator {
    return this.page.locator('[data-pending-trigger]:visible')
  }

  /** The Dashboard's «Por confirmar» card: where the desktop frame lists the pendings. */
  get dashboardPendingCard(): Locator {
    return this.dashboardSection.getByRole('region', { name: 'Por confirmar', exact: true })
  }

  /** The open pendings listed in «Por confirmar» (open it first). */
  get pendingItems(): Locator {
    return this.page.getByRole('dialog', { name: 'Por confirmar' }).locator('[data-pending-item]')
  }

  /** The sheet that edits a pending before confirming it. */
  get pendingEditSheet(): Locator {
    return this.page.getByRole('dialog', { name: 'Editar y confirmar' })
  }

  /** Opens «Por confirmar», reviews this pending and switches it to editing. */
  async openPendingEdit(description: string) {
    await this.pendingTrigger.click()
    await this.pendingItems
      .filter({ hasText: description })
      .getByRole('button', { name: /^Revisar/ })
      .click()
    await this.page
      .getByRole('dialog', { name: description })
      .getByRole('button', { name: 'Editar' })
      .click()
    await expect(this.pendingEditSheet).toBeVisible()
  }

  /** The rules listed in Configuración → Recurrentes. */
  get recurringRuleRows(): Locator {
    return this.page.locator('#settings [data-settings-rule-id]')
  }

  /** Creates an expense rule from Configuración with the quick field and its panel. */
  async addRecurringRule(params: { description: string; amount: number }) {
    await this.openSettings()
    const field = this.page.locator('#settings').getByLabel('Descripción de la nueva regla')
    await field.fill(params.description)
    await field.press('Enter')
    const panel = this.page.getByRole('dialog', { name: 'Nueva regla' })
    await expect(panel.getByLabel('Descripción')).toHaveValue(params.description)
    await panel.getByLabel('Importe').fill(String(params.amount))
    await panel.getByRole('button', { name: 'Crear regla' }).click()
    await expect(panel).toBeHidden()
  }

  async waitForSync() {
    const status = this.syncStatus
    await expect(status).toContainText('Sincronizado', { timeout: 15000 })
    await this.page.waitForLoadState('networkidle')
    await expect(status).toContainText('Sincronizado', { timeout: 15000 })
  }

  /**
   * Clicks the navigation entry for a section, on whichever navigation the
   * viewport shows. `#nav-tabs` holds the sidebar and the bottom bar, and on
   * the mobile frame the secondary sections live in the «Más» sheet; every
   * entry carries `data-section`, so that is the hook.
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
}

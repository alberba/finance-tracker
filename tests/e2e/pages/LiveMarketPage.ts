import { expect, type Locator, type Page } from '@playwright/test'

export class LiveMarketPage {
  constructor(private readonly page: Page) {}

  /** The side panel for one symbol's quote configuration. */
  get quotePanel(): Locator {
    return this.page
      .getByRole('dialog')
      .filter({ has: this.page.locator('#settings-quote-panel-title') })
  }

  /** The editor of a quote instrument, by its symbol. */
  instrument(symbol: string): Locator {
    return this.quotePanel.locator('[data-instrument-id]').filter({
      has: this.page.getByText(symbol, { exact: true }),
    })
  }

  async openQuotes(): Promise<void> {
    if (await this.quotePanel.isVisible()) await this.closeQuote()
    await this.page.locator('#settings').getByRole('tab', { name: 'Cotizaciones' }).click()
  }

  get recurringRules(): Locator {
    return this.page.locator('[data-recurring-rules]')
  }

  /** The side panel that creates and edits a recurring purchase. */
  get recurringPanel(): Locator {
    return this.page.locator('#investment-recurring-panel')
  }

  get pendingPanel(): Locator {
    return this.page.locator('[data-pending-panel]')
  }

  /** Side panel where a pending movement is edited before it is confirmed. */
  get pendingEditPanel(): Locator {
    return this.page.locator('#pending-edit-panel')
  }

  get dashboardPending(): Locator {
    return this.page.locator('#dashboard [data-dashboard-pending]')
  }

  /** Adds a symbol's quote, choosing the asset that groups its value. */
  async addInstrument(params: {
    asset: string
    type: string
    symbol: string
    quoteSymbol?: string
    currency: string
    provider?: string
    keepOpen?: boolean
  }): Promise<void> {
    await this.openQuotes()
    await this.page
      .locator('[data-settings-quotes]')
      .getByRole('button', { name: 'Nuevo símbolo' })
      .click()
    const panel = this.quotePanel
    const form = panel.locator('[data-instrument-form]')
    await form.getByLabel('Activo de agrupación').selectOption({ label: params.asset })
    await form
      .getByRole('group', { name: 'Tipo', exact: true })
      .locator(`[data-instrument-type="${params.type}"]`)
      .click()
    await form.getByLabel('Símbolo').fill(params.symbol)
    if (params.quoteSymbol !== undefined)
      await form.getByLabel('Ticker a consultar (opcional)').fill(params.quoteSymbol)
    await form.getByLabel('Moneda').fill(params.currency)
    if (params.provider) {
      await form
        .getByRole('group', { name: 'Proveedor', exact: true })
        .locator(`[data-provider="${params.provider}"]`)
        .click()
    }
    await form.getByRole('button', { name: 'Añadir instrumento' }).click()
    await expect(this.instrument(params.symbol.toUpperCase())).toBeVisible()
    if (!params.keepOpen) await this.closeQuote()
  }

  async closeQuote(): Promise<void> {
    await this.quotePanel
      .locator('footer')
      .getByRole('button', { name: 'Cerrar', exact: true })
      .click()
    await expect(this.quotePanel).toBeHidden()
  }

  async createRecurringRule(params: {
    account: string
    category: string
    description: string
    amount: number
    frequency: string
    startDate: string
    type?: 'investment'
    symbol?: string
    units?: number
    unitPrice?: number
    fee?: number
    time?: string
  }): Promise<void> {
    await this.recurringRules.getByRole('button', { name: 'Nueva compra recurrente' }).click()
    const form = this.recurringPanel
    await expect(form).toBeVisible()
    await form.getByLabel('Cuenta').selectOption({ label: params.account })
    await form.getByLabel('Categoría').selectOption({ label: params.category })
    await form.getByLabel('Descripción').fill(params.description)
    await form.getByLabel('Importe por compra').fill(String(params.amount))
    await form
      .getByRole('group', { name: 'Frecuencia' })
      .locator(`[data-frequency="${params.frequency}"]`)
      .click()
    await form.getByLabel('Fecha inicial').fill(params.startDate)
    if (params.symbol !== undefined) await form.getByLabel('Símbolo').fill(params.symbol)
    if (params.units !== undefined) await form.getByLabel('Títulos').fill(String(params.units))
    if (params.unitPrice !== undefined)
      await form.getByLabel('Precio por título').fill(String(params.unitPrice))
    if (params.fee !== undefined) await form.getByLabel('Comisiones').fill(String(params.fee))
    if (params.time !== undefined) await form.getByLabel('Hora').fill(params.time)
    await form.getByRole('button', { name: 'Crear regla' }).click()
    await expect(form).toBeHidden()
  }

  /**
   * Pins the app's today and creates a daily purchase from two days before it:
   * three pending movements. Call it with the recurring tab open.
   */
  async createThreePendingMovements(today: string): Promise<void> {
    const pin = (date: string) => {
      ;(window as Window & { __FINANCE_TODAY__?: string }).__FINANCE_TODAY__ = date
    }
    await this.page.addInitScript(pin, today)
    await this.page.evaluate(pin, today)
    const start = new Date(`${today}T00:00:00Z`)
    start.setUTCDate(start.getUTCDate() - 2)
    await this.createRecurringRule({
      account: 'Revolut',
      category: 'Fondos Indexados',
      description: 'Compra VWCE recurrente',
      amount: 100,
      frequency: 'daily',
      startDate: start.toISOString().slice(0, 10),
      symbol: 'VWCE',
      units: 1,
      unitPrice: 100,
    })
  }

  async linkExistingMovements(symbol: string): Promise<void> {
    await this.instrument(symbol).getByRole('button', { name: 'Vincular movimientos' }).click()
  }

  async editFirstRecurringRule(params: {
    description: string
    amount: number
    units?: number
    unitPrice?: number
    fee?: number
    time?: string
  }): Promise<void> {
    const row = this.recurringRules.locator('tr[data-recurring-rule-id]').first()
    await row.getByRole('button', { name: /^Editar la regla / }).click()
    const form = this.recurringPanel
    await expect(form).toBeVisible()
    await form.getByLabel('Descripción').fill(params.description)
    await form.getByLabel('Importe por compra').fill(String(params.amount))
    if (params.units !== undefined) await form.getByLabel('Títulos').fill(String(params.units))
    if (params.unitPrice !== undefined)
      await form.getByLabel('Precio por título').fill(String(params.unitPrice))
    if (params.fee !== undefined) await form.getByLabel('Comisiones').fill(String(params.fee))
    if (params.time !== undefined) await form.getByLabel('Hora').fill(params.time)
    await form.getByRole('button', { name: 'Guardar cambios' }).click()
    await expect(form).toBeHidden()
  }

  async searchSourceSymbol(currentSymbol: string, query: string): Promise<void> {
    const instrument = this.instrument(currentSymbol)
    await instrument.getByLabel(`Ticker de ${currentSymbol} en el proveedor`).fill(query)
    await instrument.getByRole('button', { name: 'Buscar aproximados' }).click()
  }

  async selectSourceSearchResult(currentSymbol: string, resultSymbol: string): Promise<void> {
    await this.instrument(currentSymbol)
      .getByRole('button', { name: `Usar símbolo ${resultSymbol}` })
      .click()
  }

  async saveSourceSymbol(currentSymbol: string): Promise<void> {
    await this.instrument(currentSymbol).getByRole('button', { name: 'Guardar símbolos' }).click()
  }

  async editFirstPending(description: string, amount: number): Promise<void> {
    const item = await this.openFirstPendingEdit()
    await item.getByLabel('Descripción').fill(description)
    await item.getByLabel('Importe').fill(String(amount))
    await item.getByRole('button', { name: 'Guardar edición' }).click()
  }

  async openFirstPendingEdit(): Promise<Locator> {
    const item = this.pendingPanel.locator('[data-pending-item]').first()
    await item.getByRole('button', { name: /^Editar/ }).click()
    await expect(this.pendingEditPanel).toBeVisible()
    return this.pendingEditPanel
  }

  async editFirstPendingInvestment(params: {
    units?: number
    unitPrice?: number
    fee?: number
    time?: string
    symbol?: string
  }): Promise<void> {
    const item = await this.openFirstPendingEdit()
    if (params.symbol !== undefined) await item.getByLabel('Símbolo').fill(params.symbol)
    if (params.units !== undefined) await item.getByLabel('Títulos').fill(String(params.units))
    if (params.unitPrice !== undefined)
      await item.getByLabel('Precio por título').fill(String(params.unitPrice))
    if (params.fee !== undefined) await item.getByLabel('Comisiones').fill(String(params.fee))
    if (params.time !== undefined) await item.getByLabel('Hora').fill(params.time)
    await item.getByRole('button', { name: 'Guardar edición' }).click()
  }

  async confirmFirstPending(): Promise<void> {
    await this.pendingPanel
      .locator('[data-pending-item]')
      .first()
      .getByRole('button', { name: /^Confirmar/ })
      .click()
  }

  async expectPendingCount(count: number): Promise<void> {
    await expect(this.pendingPanel.locator('[data-pending-item]')).toHaveCount(count)
  }
}

import { expect, type Locator, type Page } from '@playwright/test'

export class LiveMarketPage {
  constructor(private readonly page: Page) {}

  get instrumentEditor(): Locator {
    return this.page.locator('[data-instrument-editor]')
  }

  get recurringRules(): Locator {
    return this.page.locator('[data-recurring-rules]')
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

  async addInstrument(params: { asset: string; type: string; symbol: string; currency: string; provider?: string }): Promise<void> {
    const form = this.instrumentEditor.locator('form')
    await form.getByLabel('Activo').selectOption({ label: params.asset })
    await form.getByLabel('Tipo').selectOption(params.type)
    await form.getByLabel('Símbolo').fill(params.symbol)
    await form.getByLabel('Moneda').fill(params.currency)
    if (params.provider) await form.getByLabel('Proveedor').selectOption(params.provider)
    await form.getByRole('button', { name: 'Añadir instrumento' }).click()
  }

  async createRecurringRule(params: {
    account: string; category: string; description: string; amount: number; frequency: string; startDate: string;
    type?: 'investment';
    symbol?: string; units?: number; unitPrice?: number; fee?: number; time?: string;
  }): Promise<void> {
    const form = this.recurringRules.locator('form')
    await form.getByLabel('Cuenta').selectOption({ label: params.account })
    await form.getByLabel('Categoría').selectOption({ label: params.category })
    await form.getByLabel('Descripción').fill(params.description)
    await form.getByLabel('Importe').fill(String(params.amount))
    await form.getByLabel('Frecuencia').selectOption(params.frequency)
    await form.getByLabel('Fecha inicial').fill(params.startDate)
    if (params.symbol !== undefined) await form.getByLabel('Símbolo').fill(params.symbol)
    if (params.units !== undefined) await form.getByLabel('Títulos').fill(String(params.units))
    if (params.unitPrice !== undefined) await form.getByLabel('Precio por título').fill(String(params.unitPrice))
    if (params.fee !== undefined) await form.getByLabel('Comisiones').fill(String(params.fee))
    if (params.time !== undefined) await form.getByLabel('Hora').fill(params.time)
    await form.getByRole('button', { name: 'Crear compra recurrente' }).click()
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
    const row = this.instrumentEditor.getByRole('listitem').filter({ hasText: symbol })
    await row.getByRole('button', { name: 'Vincular movimientos' }).click()
  }

  async editFirstRecurringRule(params: { description: string; amount: number; units?: number; unitPrice?: number; fee?: number; time?: string }): Promise<void> {
    const row = this.recurringRules.locator('.list-item').first()
    await row.getByRole('button', { name: 'Editar' }).click()
    const form = this.recurringRules.locator('form')
    await form.getByLabel('Descripción').fill(params.description)
    await form.getByLabel('Importe').fill(String(params.amount))
    if (params.units !== undefined) await form.getByLabel('Títulos').fill(String(params.units))
    if (params.unitPrice !== undefined) await form.getByLabel('Precio por título').fill(String(params.unitPrice))
    if (params.fee !== undefined) await form.getByLabel('Comisiones').fill(String(params.fee))
    if (params.time !== undefined) await form.getByLabel('Hora').fill(params.time)
    await form.getByRole('button', { name: 'Guardar regla' }).click()
  }

  async searchSourceSymbol(currentSymbol: string, query: string): Promise<void> {
    const row = this.instrumentEditor.getByRole('listitem').filter({ hasText: currentSymbol })
    await row.getByLabel(`Símbolo fuente de ${currentSymbol}`).fill(query)
    await row.getByRole('button', { name: 'Buscar aproximados' }).click()
  }

  async selectSourceSearchResult(currentSymbol: string, resultSymbol: string): Promise<void> {
    const row = this.instrumentEditor.getByRole('listitem').filter({ hasText: currentSymbol })
    await row.getByRole('button', { name: `Usar símbolo ${resultSymbol}` }).click()
  }

  async saveSourceSymbol(currentSymbol: string): Promise<void> {
    const row = this.instrumentEditor.getByRole('listitem').filter({ hasText: currentSymbol })
    await row.getByRole('button', { name: 'Guardar' }).click()
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

  async editFirstPendingInvestment(params: { units?: number; unitPrice?: number; fee?: number; time?: string; symbol?: string }): Promise<void> {
    const item = await this.openFirstPendingEdit()
    if (params.symbol !== undefined) await item.getByLabel('Símbolo').fill(params.symbol)
    if (params.units !== undefined) await item.getByLabel('Títulos').fill(String(params.units))
    if (params.unitPrice !== undefined) await item.getByLabel('Precio por título').fill(String(params.unitPrice))
    if (params.fee !== undefined) await item.getByLabel('Comisiones').fill(String(params.fee))
    if (params.time !== undefined) await item.getByLabel('Hora').fill(params.time)
    await item.getByRole('button', { name: 'Guardar edición' }).click()
  }

  async confirmFirstPending(): Promise<void> {
    await this.pendingPanel.locator('[data-pending-item]').first().getByRole('button', { name: /^Confirmar/ }).click()
  }

  async expectPendingCount(count: number): Promise<void> {
    await expect(this.pendingPanel.locator('[data-pending-item]')).toHaveCount(count)
  }
}

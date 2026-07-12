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

  get pendingAlert(): Locator {
    return this.page.locator('[data-pending-alert]')
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

  async createRecurringRule(params: { account: string; category: string; description: string; amount: number; frequency: string; startDate: string }): Promise<void> {
    const form = this.recurringRules.locator('form')
    await form.getByLabel('Cuenta').selectOption({ label: params.account })
    await form.getByLabel('Categoría').fill(params.category)
    await form.getByLabel('Descripción').fill(params.description)
    await form.getByLabel('Importe').fill(String(params.amount))
    await form.getByLabel('Frecuencia').selectOption(params.frequency)
    await form.getByLabel('Fecha inicial').fill(params.startDate)
    await form.getByRole('button', { name: 'Crear regla' }).click()
  }

  async linkExistingMovements(symbol: string): Promise<void> {
    const row = this.instrumentEditor.getByRole('listitem').filter({ hasText: symbol })
    await row.getByRole('button', { name: 'Vincular movimientos' }).click()
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
    const item = this.pendingPanel.locator('[data-pending-item]').first()
    await item.getByRole('button', { name: 'Editar' }).click()
    await item.getByLabel('Descripción').fill(description)
    await item.getByLabel('Importe').fill(String(amount))
    await item.getByRole('button', { name: 'Guardar edición' }).click()
  }

  async confirmFirstPending(): Promise<void> {
    await this.pendingPanel.locator('[data-pending-item]').first().getByRole('button', { name: 'Confirmar' }).click()
  }

  async expectPendingCount(count: number): Promise<void> {
    await expect(this.pendingPanel.locator('[data-pending-item]')).toHaveCount(count)
  }
}

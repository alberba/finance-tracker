import { expect, type Page } from '@playwright/test'
import { FinanceTrackerPage } from './FinanceTrackerPage'

export class BitvavoPage {
  readonly tracker: FinanceTrackerPage
  constructor(readonly page: Page) {
    this.tracker = new FinanceTrackerPage(page)
  }
  get panel() {
    return this.page.getByRole('dialog', { name: 'Bitvavo', exact: true })
  }
  get rows() {
    return this.page.locator('[data-investment-tx-id]')
  }
  get details() {
    return this.page.getByRole('dialog', { name: 'Detalle Bitvavo' })
  }
  async openDetails(side: 'Compra' | 'Venta') {
    await this.rows
      .filter({ hasText: side })
      .getByRole('button', { name: 'Ver operación Bitvavo' })
      .click()
    await expect(this.details).toBeVisible()
  }
  async linkInstrument(id: string) {
    await this.details.getByLabel('Instrumento', { exact: true }).selectOption(id)
    await this.details.getByRole('button', { name: 'Vincular instrumento' }).click()
    await expect(this.details).toBeHidden()
  }
  async open() {
    await this.tracker.openSettings()
    await expect(
      this.page
        .getByRole('region', { name: 'Conexiones', exact: true })
        .getByRole('button', { name: 'Stock Events', exact: true }),
    ).toBeVisible()
    await this.page.getByRole('button', { name: 'Bitvavo', exact: true }).click()
    await expect(this.panel).toBeVisible()
  }
  async connect(accountId: string) {
    await this.panel.getByLabel('API key', { exact: true }).fill('test-key')
    await this.panel.getByLabel('Secreto API').fill('test-secret')
    await this.panel.getByLabel('Cuenta de destino').selectOption(accountId)
    await this.panel.getByLabel('Fecha inicial').fill('2019-01-01')
    await this.panel.getByLabel('Zona horaria').fill('Europe/Madrid')
    await this.panel.getByRole('button', { name: 'Validar y guardar conexión' }).click()
    await expect(this.panel.getByRole('button', { name: 'Preparar vista previa' })).toBeVisible()
  }
  async preview() {
    await this.panel.getByRole('button', { name: 'Preparar vista previa' }).click()
    await expect(this.panel.getByRole('heading', { name: '1 compras · 1 ventas' })).toBeVisible()
  }
  async confirm() {
    await this.panel.getByRole('button', { name: 'Confirmar importación completa' }).click()
    await expect(this.panel.getByRole('status')).toContainText('movimientos importados')
  }
  async close() {
    await this.panel.getByRole('button', { name: 'Cerrar', exact: true }).last().click()
  }
}

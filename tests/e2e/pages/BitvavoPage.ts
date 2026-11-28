import { expect, type Page } from '@playwright/test'
import { FinanceTrackerPage } from './FinanceTrackerPage'

/** The Bitvavo panel of Configuración › Conexiones. */
export class BitvavoPage {
  readonly tracker: FinanceTrackerPage
  constructor(readonly page: Page) {
    this.tracker = new FinanceTrackerPage(page)
  }
  get panel() {
    return this.page.getByRole('dialog', { name: 'Bitvavo', exact: true })
  }
  async open() {
    await this.tracker.openSettings()
    await this.page
      .locator('#settings')
      .getByRole('button', { name: 'Bitvavo', exact: true })
      .click()
    await expect(this.panel).toBeVisible()
  }
  async connect(accountId: string) {
    // Without a connection the form comes unfolded.
    const apiKey = this.panel.getByLabel('API key', { exact: true })
    if (!(await apiKey.isVisible())) await this.panel.getByText('Conectar cuenta').click()
    await apiKey.fill('test-key')
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
    await expect(this.notice).toContainText('movimientos importados')
  }
  /** The outcome of the last action (import, sync, save, disconnect). */
  get notice() {
    return this.panel.locator('[data-bitvavo-notice]')
  }
  get status() {
    return this.panel.locator('[data-bitvavo-status]')
  }
  async syncNow() {
    await this.panel.getByRole('button', { name: 'Sincronizar ahora' }).click()
  }
  /** Replaces the key keeping every other setting. */
  async replaceKey() {
    await this.panel.getByLabel('API key', { exact: true }).fill('new-key')
    await this.panel.getByLabel('Secreto API').fill('new-secret')
    await this.panel.getByRole('button', { name: 'Guardar conexión', exact: true }).click()
    await expect(this.notice).toContainText('Conexión validada')
  }
  async disconnect() {
    await this.panel.getByRole('button', { name: 'Desconectar Bitvavo' }).click()
    const dialog = this.page.getByRole('alertdialog', { name: '¿Desconectar Bitvavo?' })
    await dialog.getByRole('button', { name: 'Desconectar', exact: true }).click()
    await expect(this.notice).toContainText('Bitvavo desconectado')
  }
  async close() {
    await this.panel.getByRole('button', { name: 'Cerrar', exact: true }).last().click()
    await expect(this.panel).toBeHidden()
  }
}

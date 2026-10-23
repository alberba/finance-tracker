import { FinanceTrackerPage } from './FinanceTrackerPage'
import { expect, type Page } from '@playwright/test'
export class AuthenticationPage {
  constructor(readonly page: Page) {}
  async goto(invitation?: string) {
    await this.page.goto(invitation ?? '/login')
    await expect(this.page.getByRole('heading', { name: 'Accede a Finanzas' })).toBeVisible()
    await this.ready()
  }
  async signIn(email: string) {
    await this.page.getByRole('button', { name: 'Código por correo', exact: true }).click()
    await expect(this.page.getByLabel('Código de seis cifras')).toBeDisabled()
    await this.page.getByLabel('Correo electrónico').fill(email)
    await this.page.getByRole('button', { name: 'Enviar código', exact: true }).click()
    await expect(this.page.getByRole('status')).toContainText('Revisa tu correo')
    const code = await this.deliveredCode(email)
    await this.page.getByLabel('Código de seis cifras').fill(code)
    await this.page.getByRole('button', { name: 'Entrar en Finanzas', exact: true }).click()
    await expect(this.page).toHaveURL(/\/$/)
    await this.ready()
  }
  async recover(email: string) {
    await this.goto()
    await this.page.getByRole('button', { name: 'Recuperar acceso', exact: true }).click()
    await expect(this.page.getByLabel('Nueva contraseña')).toBeDisabled()
    await expect(this.page.getByLabel('Código de seis cifras')).toBeDisabled()
    await this.page.getByLabel('Correo electrónico').fill(email)
    await this.page.getByRole('button', { name: 'Enviar código', exact: true }).click()
    await expect(this.page.getByRole('status')).toContainText('Revisa tu correo')
    await expect(this.page.getByLabel('Nueva contraseña')).toBeEnabled()
    await this.page.getByLabel('Nueva contraseña').fill('recovered-password-for-e2e')
    await this.page.getByLabel('Código de seis cifras').fill(await this.deliveredCode(email))
    await this.page
      .getByRole('form', { name: 'Acceso a Finanzas' })
      .getByRole('button', { name: 'Recuperar acceso', exact: true })
      .click()
    await expect(this.page).toHaveURL(/\/$/)
    await this.ready()
  }
  async deliveredCode(email: string) {
    const port = Number(process.env.AUTH_TEST_PORT ?? 4466) + 1
    const mail = await this.page.request.get(
      `http://127.0.0.1:${port}/mail?email=${encodeURIComponent(email)}`,
    )
    return (await mail.json()).text.match(/\b\d{6}\b/)[0] as string
  }
  async openSecurity() {
    await new FinanceTrackerPage(this.page).open('settings')
    await this.page.getByRole('tab', { name: 'Preferencias', exact: true }).click()
  }
  async ready() {
    await expect(this.page.locator('html[data-finance-ready="true"]')).toBeAttached()
    if (new URL(this.page.url()).pathname !== '/login') {
      await new FinanceTrackerPage(this.page).dismissWelcomeIfNeeded()
    }
  }
}

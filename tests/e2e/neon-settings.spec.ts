import type { Page } from '@playwright/test'
import { test, expect } from './fixtures'
import { expectSyncCommand } from './pages/sync'

/**
 * Configuración in the new design (#443), desktop. No cookie: the new design is
 * the default. The seed brings its accounts, so the journeys edit those.
 */
const NO_COOKIE = { cookies: [], origins: [] }

test.use({ storageState: NO_COOKIE })

const section = (page: Page) => page.locator('#settings')

test.describe('Configuración en el diseño nuevo', () => {
  test(
    'cambia la moneda en Preferencias y la ve aplicada al recargar',
    { tag: '@smoke' },
    async ({ page, tracker }) => {
      await tracker.openSettings()
      await expect(
        section(page).getByRole('heading', { name: 'Configuración', level: 1 }),
      ).toBeVisible()
      const index = section(page).getByRole('navigation', { name: 'Índice de configuración' })
      await expect(index.getByRole('link', { name: /Cuentas/ })).toBeVisible()

      await index.getByRole('link', { name: 'Preferencias' }).click()
      await section(page).getByLabel('Año de trabajo').fill('2025')
      await section(page).getByLabel('Moneda').fill('usd')
      const saved = expectSyncCommand(
        page,
        (command) => command.action === 'settingsUpdate' && command.patch.currency === 'USD',
      )
      await section(page).getByRole('button', { name: 'Guardar ajustes' }).click()
      await expect(page.getByRole('status')).toContainText('Configuración general guardada.')
      await saved

      await tracker.reload()
      await tracker.openSettings()
      await expect(section(page).getByLabel('Moneda')).toHaveValue('USD')
    },
  )

  test('edita una cuenta en su fila y ve el total al recargar', async ({ page, tracker }) => {
    await tracker.openSettings()
    const row = section(page).locator('[data-account-id]').first()
    const total = section(page).locator('[data-settings-total="cuentas"]')
    const before = await total.innerText()

    const balance = row.getByLabel(/^Saldo inicial de /)
    const renamed = expectSyncCommand(
      page,
      (command) =>
        command.action === 'update' &&
        command.entityType === 'account' &&
        command.patch.openingBalance === 1234.5,
    )
    await balance.fill('1.234,5')
    await balance.press('Enter')
    await renamed
    await expect(balance).toHaveValue(/^1\.234,50/)
    await expect(total).not.toHaveText(before)

    await tracker.reload()
    await tracker.openSettings()
    await expect(
      section(page)
        .locator('[data-account-id]')
        .first()
        .getByLabel(/^Saldo inicial de /),
    ).toHaveValue(/^1\.234,50/)
  })

  test('añade una cuenta y la elimina tras confirmarlo', async ({ page, tracker }) => {
    await tracker.openSettings()
    const created = expectSyncCommand(
      page,
      (command) =>
        command.action === 'create' &&
        command.entityType === 'account' &&
        command.data.name === 'Cuenta Vacaciones',
    )
    await section(page).getByLabel('Nombre de la nueva cuenta').fill('Cuenta Vacaciones')
    await section(page).getByLabel('Saldo inicial de la nueva cuenta').fill('500')
    await section(page).getByRole('button', { name: 'Añadir' }).first().click()
    await created

    const row = section(page)
      .locator('[data-account-id]')
      .filter({ has: page.getByRole('button', { name: 'Eliminar Cuenta Vacaciones' }) })
    await expect(row).toHaveCount(1)
    await expect(row.getByLabel(/^Saldo inicial de /)).toHaveValue(/^500,00/)

    await row.getByRole('button', { name: 'Eliminar Cuenta Vacaciones' }).click()
    const confirm = page.getByRole('alertdialog', { name: '¿Eliminar esta cuenta?' })
    await expect(confirm).toContainText('Cuenta Vacaciones')
    await confirm.getByRole('button', { name: 'Eliminar cuenta' }).click()
    await expect(row).toHaveCount(0)
  })

  test('añade, reordena y elimina una categoría de gasto', async ({ page, tracker }) => {
    await tracker.openSettings()
    const expenses = section(page).locator('[data-category-list="expenseCategories"]')

    await expenses.getByLabel('Nueva categoría de gastos').fill('Mascotas')
    await expenses.getByRole('button', { name: 'Añadir' }).click()
    const item = expenses.locator('[data-category="Mascotas"]')
    await expect(item).toBeVisible()
    await expect(expenses.locator('[data-category]').last()).toHaveAttribute(
      'data-category',
      'Mascotas',
    )

    await item.getByRole('button', { name: 'Subir Mascotas' }).click()
    await expect(expenses.locator('[data-category]').last()).not.toHaveAttribute(
      'data-category',
      'Mascotas',
    )

    await item.getByRole('button', { name: 'Eliminar categoría Mascotas' }).click()
    const confirm = page.getByRole('alertdialog', { name: '¿Eliminar esta categoría?' })
    await confirm.getByRole('button', { name: 'Eliminar categoría' }).click()
    await expect(item).toHaveCount(0)
  })

  test('crea una regla recurrente y la pausa', async ({ page, tracker }) => {
    await tracker.openSettings()
    await section(page).getByLabel('Descripción de la nueva regla').fill('Alquiler')
    await section(page).getByLabel('Descripción de la nueva regla').press('Enter')
    const panel = page.getByRole('dialog', { name: 'Nueva regla' })
    await expect(panel.getByLabel('Descripción')).toHaveValue('Alquiler')
    await panel.getByLabel('Importe').fill('800')
    const created = expectSyncCommand(
      page,
      (command) =>
        command.action === 'create' &&
        command.entityType === 'recurringRule' &&
        command.data.name === 'Alquiler',
    )
    await panel.getByRole('button', { name: 'Crear regla' }).click()
    await created

    const rule = section(page).locator('[data-settings-rule-id]').filter({ hasText: 'Alquiler' })
    await expect(rule.locator('[data-settings-rule-amount]')).toContainText('800,00')
    const paused = expectSyncCommand(
      page,
      (command) => command.action === 'update' && command.entityType === 'recurringRule',
    )
    await rule.getByRole('switch', { name: 'Regla Alquiler activa' }).click()
    await paused
    await expect(rule).toContainText('Pausada')
  })

  test('cierra sesión desde el bloque de cuenta y llega al login', async ({ page, tracker }) => {
    await tracker.openSettings()
    await tracker.waitForSync()
    await section(page).getByRole('button', { name: 'Cerrar sesión' }).click()
    // Sign-out first flushes what is still waiting to sync.
    await expect(page).toHaveURL(/\/login$/)
  })
})

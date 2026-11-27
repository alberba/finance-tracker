import type { Page } from '@playwright/test'
import { test, expect } from './fixtures'
import { editScenarioState, readScenarioState } from './seed-sync-v2'
import { expectSyncCommand } from './pages/sync'
import { typeOnKeypad } from './entry-keypad'

/** Alta y revisión de pendientes. */
const sheet = (page: Page) => page.getByRole('dialog', { name: 'Nuevo movimiento' })
const MOBILE = { width: 393, height: 780 }
const DESKTOP = { width: 1280, height: 800 }

const TYPES = [
  { label: 'Gasto', description: 'Hoja gasto' },
  { label: 'Ingreso', description: 'Hoja ingreso' },
  { label: 'Ahorro', description: 'Hoja ahorro' },
  { label: 'Inversión', description: 'Hoja inversión' },
] as const

test.describe('Mini modal de alta', () => {
  test('apunta cada tipo desde el botón «Apuntar» del móvil y sobrevive a recargar', async ({
    page,
    tracker,
  }) => {
    await page.setViewportSize(MOBILE)
    await tracker.goto()

    for (const { label, description } of TYPES) {
      await page.locator('[data-fab-apuntar]').click()
      await expect(sheet(page)).toBeVisible()
      await sheet(page).getByRole('radio', { name: label }).click()
      // On a phone the amount comes from the sheet's own keypad.
      await typeOnKeypad(sheet(page), '12,34')
      await sheet(page).getByLabel('Nota').fill(description)
      await sheet(page).getByRole('button', { name: 'Guardar' }).click()
      await expect(sheet(page)).toBeHidden()
    }

    await tracker.reload()
    await tracker.openTransactions()
    for (const { description } of TYPES) {
      await expect(tracker.transactionsSection.getByText(description).first()).toBeVisible()
    }
  })

  test('guarda un gasto y su mes contable desde la cabecera del Dashboard', async ({
    page,
    tracker,
  }) => {
    await page.setViewportSize(DESKTOP)
    await tracker.goto()

    await page.locator('#dashboard').getByRole('button', { name: 'Apuntar', exact: true }).click()
    await expect(sheet(page)).toBeVisible()
    await sheet(page).getByRole('textbox', { name: 'Importe' }).fill('7')
    await sheet(page).getByLabel('Descripción').fill('Gasto escritorio')
    await sheet(page).getByText('Fecha y mes contable').click()
    const dateTrigger = sheet(page).getByRole('button', { name: 'Fecha', exact: true })
    await dateTrigger.click()
    const calendar = sheet(page).getByRole('dialog', { name: 'Fecha', exact: true })
    const typedDate = calendar.getByRole('textbox', { name: 'Escribir fecha' })
    await typedDate.fill('31/02/2026')
    await typedDate.press('Enter')
    await expect(calendar.getByRole('alert')).toBeVisible()
    await typedDate.fill('12/07/2026')
    await typedDate.press('Enter')
    await expect(calendar).toBeHidden()

    await dateTrigger.click()
    await calendar.getByRole('button', { name: '13 de julio de 2026', exact: true }).click()
    await expect(calendar).toBeHidden()

    await sheet(page).getByRole('button', { name: 'Cuenta en el mes' }).click()
    await sheet(page)
      .getByRole('dialog', { name: 'Cuenta en el mes' })
      .getByRole('button', { name: 'Junio', exact: true })
      .click()

    const saved = expectSyncCommand(
      page,
      (command) => command.action === 'create' && command.entityType === 'transaction',
    )
    await sheet(page).getByRole('button', { name: 'Guardar' }).click()
    await saved
    await expect(sheet(page)).toBeHidden()

    await tracker.reload()
    const state = await readScenarioState(page)
    expect(state.transactions.find((tx) => tx.description === 'Gasto escritorio')).toMatchObject({
      amount: 7,
      date: '2026-07-13',
      month: 6,
    })
  })

  test('cancelar no guarda nada y la hoja reabre vacía y arriba', async ({ page, tracker }) => {
    await page.setViewportSize(MOBILE)
    await tracker.goto()

    await page.locator('[data-fab-apuntar]').click()
    await sheet(page).getByRole('radio', { name: 'Ingreso' }).click()
    await typeOnKeypad(sheet(page), '99')
    await expect(sheet(page).locator('[data-entry-amount]')).toContainText('+99')
    await sheet(page).getByLabel('Nota').fill('Cancelado')
    const account = sheet(page).getByRole('button', { name: 'Cuenta', exact: true })
    const previousAccount = await account.innerText()
    await account.click()
    const accounts = sheet(page).getByRole('dialog', { name: 'Cuenta', exact: true })
    await expect(accounts.getByRole('button', { pressed: true })).toBeFocused()
    await page.keyboard.press('ArrowDown')
    await page.keyboard.press('Enter')
    await expect(accounts).toBeHidden()
    await expect(account).not.toHaveText(previousAccount)
    await expect(account).toBeFocused()

    await sheet(page).getByRole('button', { name: 'Categoría', exact: true }).click()
    const categories = sheet(page).getByRole('dialog', { name: 'Categoría', exact: true })
    await expect(categories.getByRole('searchbox', { name: 'Buscar categoría' })).toBeVisible()
    await page.keyboard.press('Escape')
    await expect(categories).toBeHidden()

    // The date's panel also chooses the accounting month.
    await sheet(page).getByRole('button', { name: 'Fecha', exact: true }).click()
    const date = sheet(page).getByRole('dialog', { name: 'Fecha', exact: true })
    await date.getByRole('combobox', { name: 'Cuenta en el mes' }).selectOption({ label: 'Abril' })
    await expect(date).toBeVisible()
    await page.keyboard.press('Escape')
    await expect(sheet(page).getByRole('button', { name: 'Fecha', exact: true })).toContainText(
      'Hoy · Abril',
    )
    await page.keyboard.press('Escape')
    await expect(sheet(page)).toBeHidden()

    await page.locator('[data-fab-apuntar]').click()
    await expect(sheet(page)).toBeVisible()
    await expect(sheet(page).locator('[data-entry-amount]')).toHaveText(/^0\s*€$/)
    await expect(sheet(page).getByLabel('Nota')).toHaveValue('')
    await expect(sheet(page).getByRole('radio', { name: 'Gasto' })).toHaveAttribute(
      'aria-checked',
      'true',
    )
    const scrollTop = await sheet(page)
      .locator('form')
      .evaluate((form) => form.scrollTop)
    expect(scrollTop).toBe(0)

    await page.keyboard.press('Escape')
    await tracker.reload()
    await tracker.openTransactions()
    await expect(tracker.transactionsSection.getByText('Cancelado')).toHaveCount(0)
  })

  test('el mini modal recibe el foco y Escape lo devuelve', async ({ page, tracker }) => {
    await page.setViewportSize(DESKTOP)
    await page.emulateMedia({ reducedMotion: 'reduce' })
    await tracker.goto()
    const opener = page.locator('#dashboard').getByRole('button', { name: 'Apuntar', exact: true })
    await opener.click()
    const amount = sheet(page).getByRole('textbox', { name: 'Importe' })
    await expect(amount).toBeFocused()

    await page.keyboard.press('Shift+Tab')
    const type = sheet(page).getByRole('radio', { name: 'Inversión' })
    await expect(type).toBeFocused()
    const category = sheet(page).getByRole('button', { name: 'Categoría', exact: true })
    await category.click()
    const categories = sheet(page).getByRole('dialog', { name: 'Categoría', exact: true })
    await expect(categories).toBeVisible()
    await page.keyboard.press('Escape')
    await expect(categories).toBeHidden()
    await expect(sheet(page)).toBeVisible()
    await expect(category).toBeFocused()

    await page.keyboard.press('Escape')
    await expect(sheet(page)).toBeHidden()
    await expect(opener).toBeFocused()
  })

  test('un importe vacío avisa de que debe ser mayor que 0', async ({ page, tracker }) => {
    await page.setViewportSize(MOBILE)
    await tracker.goto()

    await page.locator('[data-fab-apuntar]').click()
    await sheet(page).getByRole('button', { name: 'Guardar' }).click()

    await expect(page.locator('#toast')).toHaveText('El importe debe ser mayor que 0.')
    await expect(sheet(page)).toBeVisible()
  })
})

test.describe('Editar y confirmar un pendiente', () => {
  const editSheet = (page: Page) => page.getByRole('dialog', { name: 'Editar y confirmar' })

  async function openPendingEdit(page: Page, description: string): Promise<void> {
    await page.locator('[data-pending-trigger]').click()
    await page
      .getByRole('dialog', { name: 'Por confirmar' })
      .locator('[data-pending-item]')
      .filter({ hasText: description })
      .getByRole('button', { name: /^Revisar/ })
      .click()
    await page
      .getByRole('dialog', { name: description })
      .getByRole('button', { name: 'Editar' })
      .click()
    await expect(editSheet(page)).toBeVisible()
  }

  test('cancelar deja el pendiente como estaba; guardar lo confirma con los datos nuevos', async ({
    page,
    tracker,
  }) => {
    await page.setViewportSize(MOBILE)
    // The recurring engine reads this clock: one monthly due date per rule, 1 July.
    await page.addInitScript(() => {
      ;(window as Window & { __FINANCE_TODAY__?: string }).__FINANCE_TODAY__ = '2026-07-10'
    })
    await editScenarioState(page, (state) => {
      state.recurringRules.push({
        id: 'rent-rule',
        type: 'expense',
        accountId: state.accounts[0].id,
        category: state.expenseCategories[0],
        description: 'Alquiler',
        amount: 900,
        frequency: 'monthly',
        interval: 1,
        startDate: '2026-07-01',
        endDate: null,
        active: true,
        lastExecutionDate: null,
        nextOccurrenceDate: '2026-07-01',
      })
      state.recurringRules.push({
        id: 'vwce-rule',
        type: 'investment',
        accountId: state.accounts[0].id,
        category: 'Fondos Indexados',
        description: 'Compra VWCE',
        amount: 100,
        frequency: 'monthly',
        interval: 1,
        startDate: '2026-07-01',
        endDate: null,
        active: true,
        lastExecutionDate: null,
        nextOccurrenceDate: '2026-07-01',
        symbol: 'VWCE',
        side: 'buy',
        units: 1,
        unitPrice: 100,
        fee: 0,
      })
    })
    await expect(page.locator('[data-pending-trigger]')).toHaveAccessibleName(
      'Por confirmar, 2 pendientes',
    )

    await openPendingEdit(page, 'Alquiler')
    const amount = editSheet(page).getByRole('textbox', { name: 'Importe' })
    await expect(amount).toHaveValue('900')
    await expect(editSheet(page).getByLabel('Descripción')).toHaveValue('Alquiler')
    await amount.fill('950')
    await editSheet(page).getByRole('button', { name: 'Cancelar' }).click()
    await expect(editSheet(page)).toBeHidden()

    await openPendingEdit(page, 'Alquiler')
    await expect(amount).toHaveValue('900')
    const pendingAfterCancel = (await readScenarioState(page)).pendingMovements.find(
      (item) => item.ruleId === 'rent-rule',
    )
    expect(pendingAfterCancel).toMatchObject({ status: 'pending', amount: 900 })

    const isConfirmation = (command: Parameters<Parameters<typeof expectSyncCommand>[1]>[0]) =>
      command.action === 'update' &&
      command.entityType === 'pendingMovement' &&
      command.patch.status === 'confirmed'
    const confirmed = expectSyncCommand(page, isConfirmation)
    await amount.fill('950')
    await editSheet(page).getByRole('button', { name: 'Guardar y confirmar' }).click()
    await confirmed
    await expect(editSheet(page)).toBeHidden()

    // An investment shows its operation instead of the amount; the total follows it.
    await openPendingEdit(page, 'Compra VWCE')
    await expect(editSheet(page).getByLabel('Símbolo')).toHaveValue('VWCE')
    await editSheet(page).getByLabel('Títulos').fill('2')
    await editSheet(page).getByLabel('Precio por título').fill('105')
    await editSheet(page).getByLabel('Comisiones').fill('1')
    await expect(editSheet(page).locator('[data-pending-total]')).toHaveText('211,00 €')
    const investmentConfirmed = expectSyncCommand(page, isConfirmation)
    await editSheet(page).getByRole('button', { name: 'Guardar y confirmar' }).click()
    await investmentConfirmed
    await expect(editSheet(page)).toBeHidden()

    await tracker.reload()
    await expect(page.locator('[data-pending-trigger]')).toHaveAccessibleName('Por confirmar')
    const state = await readScenarioState(page)
    expect(state.pendingMovements.find((item) => item.ruleId === 'rent-rule')).toMatchObject({
      status: 'confirmed',
      amount: 950,
    })
    expect(state.transactions.filter((tx) => tx.description === 'Alquiler')).toEqual([
      expect.objectContaining({ amount: 950, date: '2026-07-01', type: 'expense' }),
    ])
    expect(state.transactions.filter((tx) => tx.description === 'Compra VWCE')).toEqual([
      expect.objectContaining({
        amount: 211,
        type: 'investment',
        symbol: 'VWCE',
        side: 'buy',
        units: 2,
        unitPrice: 105,
        fee: 1,
      }),
    ])
  })
})

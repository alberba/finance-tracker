import type { Page } from '@playwright/test'
import { test, expect } from './fixtures'
import { editScenarioState, readScenarioState } from './seed-sync-v2'
import { expectSyncCommand } from './pages/sync'

/** Hoja de alta del diseño nuevo (#426). No cookie: el diseño nuevo es el de por defecto. */
const NO_COOKIE = { cookies: [], origins: [] }

const sheet = (page: Page) => page.getByRole('dialog', { name: 'Apuntar' })
const MOBILE = { width: 393, height: 780 }
const DESKTOP = { width: 1280, height: 800 }

const TYPES = [
  { label: 'Gasto', description: 'Hoja gasto' },
  { label: 'Ingreso', description: 'Hoja ingreso' },
  { label: 'Ahorro', description: 'Hoja ahorro' },
  { label: 'Inversión', description: 'Hoja inversión' },
] as const

test.describe('Hoja de alta nueva', () => {
  test.use({ storageState: NO_COOKIE })

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
      await sheet(page).getByRole('textbox', { name: 'Importe' }).fill('12,34')
      await sheet(page).getByLabel('Descripción').fill(description)
      await sheet(page).getByRole('button', { name: 'Guardar' }).click()
      await expect(sheet(page)).toBeHidden()
    }

    await tracker.reload()
    await tracker.openTransactions()
    for (const { description } of TYPES) {
      await expect(tracker.transactionsSection.getByText(description).first()).toBeVisible()
    }
  })

  test('apunta un gasto desde la barra lateral de escritorio', async ({ page, tracker }) => {
    await page.setViewportSize(DESKTOP)
    await tracker.goto()

    await page.locator('[data-sidebar-apuntar]').click()
    await expect(sheet(page)).toBeVisible()
    await sheet(page).getByRole('textbox', { name: 'Importe' }).fill('7')
    await sheet(page).getByLabel('Descripción').fill('Hoja escritorio')
    await sheet(page).getByRole('button', { name: 'Guardar' }).click()
    await expect(sheet(page)).toBeHidden()

    await tracker.reload()
    await tracker.openTransactions()
    await expect(
      tracker.transactionsSection.getByText('Hoja escritorio').locator('visible=true').first(),
    ).toBeVisible()
  })

  test('cancelar no guarda nada y la hoja reabre vacía y arriba', async ({ page, tracker }) => {
    await page.setViewportSize(MOBILE)
    await tracker.goto()

    await page.locator('[data-fab-apuntar]').click()
    await sheet(page).getByRole('radio', { name: 'Ingreso' }).click()
    await sheet(page).getByRole('textbox', { name: 'Importe' }).fill('99')
    await sheet(page).getByLabel('Descripción').fill('Cancelado')
    await sheet(page).getByLabel('Cuenta en el mes').scrollIntoViewIfNeeded()
    await sheet(page).getByRole('button', { name: 'Cancelar' }).click()
    await expect(sheet(page)).toBeHidden()

    await page.locator('[data-fab-apuntar]').click()
    await expect(sheet(page)).toBeVisible()
    await expect(sheet(page).getByRole('textbox', { name: 'Importe' })).toHaveValue('')
    await expect(sheet(page).getByLabel('Descripción')).toHaveValue('')
    await expect(sheet(page).getByRole('radio', { name: 'Gasto' })).toHaveAttribute(
      'aria-checked',
      'true',
    )
    const scrollTop = await sheet(page)
      .locator('form')
      .evaluate((form) => form.scrollTop)
    expect(scrollTop).toBe(0)

    await sheet(page).getByRole('button', { name: 'Cancelar' }).click()
    await tracker.reload()
    await tracker.openTransactions()
    await expect(tracker.transactionsSection.getByText('Cancelado')).toHaveCount(0)
  })

  test('el panel de escritorio queda pegado a la derecha y no desborda', async ({
    page,
    tracker,
  }) => {
    await page.setViewportSize(DESKTOP)
    await tracker.goto()
    await page.locator('[data-sidebar-apuntar]').click()
    await expect(sheet(page)).toBeVisible()

    const box = await sheet(page).evaluate((dialog) => {
      const rect = dialog.getBoundingClientRect()
      const form = dialog.querySelector('form')!
      return {
        right: rect.right,
        width: rect.width,
        overflows: form.scrollWidth > form.clientWidth,
      }
    })
    expect(box).toEqual({ right: DESKTOP.width, width: 380, overflows: false })
  })

  test('un importe vacío da el mismo error que el panel antiguo', async ({ page, tracker }) => {
    await page.setViewportSize(MOBILE)
    await tracker.goto()

    await page.locator('[data-fab-apuntar]').click()
    await sheet(page).getByRole('button', { name: 'Guardar' }).click()

    await expect(page.locator('#toast')).toHaveText('El importe debe ser mayor que 0.')
    await expect(sheet(page)).toBeVisible()
  })
})

test.describe('Editar y confirmar un pendiente en la hoja nueva', () => {
  test.use({ storageState: NO_COOKIE })

  const editSheet = (page: Page) => page.getByRole('dialog', { name: 'Editar y confirmar' })

  async function openPendingEdit(page: Page): Promise<void> {
    await page.locator('[data-pending-trigger]').click()
    await page
      .getByRole('dialog', { name: 'Por confirmar' })
      .locator('[data-pending-item]')
      .getByRole('button')
      .click()
    await page
      .getByRole('dialog', { name: 'Alquiler' })
      .getByRole('button', { name: 'Editar' })
      .click()
    await expect(editSheet(page)).toBeVisible()
  }

  test('cancelar deja el pendiente como estaba; guardar lo confirma con el importe nuevo', async ({
    page,
    tracker,
  }) => {
    await page.setViewportSize(MOBILE)
    // The recurring engine reads this clock: one monthly due date, 1 July.
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
    })
    await expect(page.locator('[data-pending-trigger]')).toHaveAccessibleName(
      'Por confirmar, 1 pendientes',
    )

    await openPendingEdit(page)
    const amount = editSheet(page).getByRole('textbox', { name: 'Importe' })
    await expect(amount).toHaveValue('900')
    await expect(editSheet(page).getByLabel('Descripción')).toHaveValue('Alquiler')
    await amount.fill('950')
    await editSheet(page).getByRole('button', { name: 'Cancelar' }).click()
    await expect(editSheet(page)).toBeHidden()

    await openPendingEdit(page)
    await expect(amount).toHaveValue('900')
    const pendingAfterCancel = (await readScenarioState(page)).pendingMovements.find(
      (item) => item.ruleId === 'rent-rule',
    )
    expect(pendingAfterCancel).toMatchObject({ status: 'pending', amount: 900 })

    const confirmed = expectSyncCommand(
      page,
      (command) =>
        command.action === 'update' &&
        command.entityType === 'pendingMovement' &&
        command.patch.status === 'confirmed',
    )
    await amount.fill('950')
    await editSheet(page).getByRole('button', { name: 'Guardar y confirmar' }).click()
    await confirmed
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
  })
})

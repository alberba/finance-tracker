import type { Page } from '@playwright/test'
import { test, expect } from './fixtures'
import { expectSyncCommand } from './pages/sync'

/**
 * Configuración in the mobile frame (#444), in the mobile
 * project. The index opens each
 * apartado on its own screen; the seed brings its accounts. Labels and counts
 * are the view-model's unit tests'; here, what the user does and what they get.
 */
const section = (page: Page) => page.locator('#settings')
const index = (page: Page) => section(page).getByRole('navigation', { name: 'Ajustes' })

async function openPart(page: Page, label: string): Promise<void> {
  await index(page)
    .getByRole('button', { name: new RegExp(`^${label} `) })
    .click()
  await expect(
    section(page).getByRole('heading', { name: label, level: 1, exact: true }),
  ).toBeVisible()
}

async function backToIndex(page: Page): Promise<void> {
  await section(page).getByRole('button', { name: 'Ajustes', exact: true }).click()
  await expect(
    section(page).getByRole('heading', { name: 'Configuración', level: 1 }),
  ).toBeVisible()
}

test.beforeEach(async ({ tracker }) => {
  await tracker.openSettings()
})

test('edita una cuenta en su hoja, añade otra y la elimina', async ({ page }) => {
  await openPart(page, 'Cuentas')
  const total = section(page).locator('[data-settings-total="cuentas"]')
  const before = await total.innerText()

  const first = section(page).locator('[data-settings-row]').first()
  await first.getByRole('button', { name: /^Editar / }).click()
  const edit = page.getByRole('dialog', { name: 'Editar cuenta' })
  await expect(edit).toBeVisible()
  const updated = expectSyncCommand(
    page,
    (command) =>
      command.action === 'update' &&
      command.entityType === 'account' &&
      command.patch.openingBalance === 1234.5,
  )
  await edit.getByLabel('Saldo inicial').fill('1.234,5')
  await edit.getByRole('button', { name: 'Guardar' }).click()
  await expect(edit).toBeHidden()
  await updated
  await expect(first.locator('[data-settings-row-amount]')).toContainText('1.234,50')
  await expect(total).not.toHaveText(before)

  await section(page).getByRole('button', { name: 'Nueva cuenta' }).click()
  const fresh = page.getByRole('dialog', { name: 'Nueva cuenta' })
  await fresh.getByLabel('Nombre').fill('Cuenta Vacaciones')
  await fresh.getByLabel('Saldo inicial').fill('500')
  const created = expectSyncCommand(
    page,
    (command) =>
      command.action === 'create' &&
      command.entityType === 'account' &&
      command.data.name === 'Cuenta Vacaciones',
  )
  await fresh.getByRole('button', { name: 'Añadir' }).click()
  await expect(fresh).toBeHidden()
  await created

  const row = section(page).locator('[data-settings-row]').filter({ hasText: 'Cuenta Vacaciones' })
  await expect(row.locator('[data-settings-row-amount]')).toContainText('500,00')
  await row.getByRole('button', { name: 'Eliminar Cuenta Vacaciones' }).click()
  const confirm = page.getByRole('alertdialog', { name: '¿Eliminar esta cuenta?' })
  await confirm.getByRole('button', { name: 'Eliminar cuenta' }).click()
  await expect(row).toHaveCount(0)
})

test('todos los controles miden al menos 44 px con puntero táctil', async ({ page }) => {
  expect(await page.evaluate(() => matchMedia('(pointer: coarse)').matches)).toBe(true)

  // A switch is drawn 28 px tall and widens its touch area to 44 px with a
  // pseudo-element, which the box of the element does not count.
  const tooSmall = (selector: string) =>
    page.locator(selector).evaluateAll((controls) =>
      controls
        .filter((control) => control.getClientRects().length > 0)
        .filter((control) => control.getAttribute('role') !== 'switch')
        .map((control) => {
          const { width, height } = control.getBoundingClientRect()
          const name = control.getAttribute('aria-label') || control.textContent?.trim()
          return { name, width: Math.round(width), height: Math.round(height) }
        })
        .filter(({ width, height }) => width < 44 || height < 44),
    )
  const CONTROLS = '#settings :is(button, a[href], input, select)'

  expect(await tooSmall(CONTROLS)).toEqual([])
  for (const part of [
    'Cuentas',
    'Activos',
    'Pasivos',
    'Categorías',
    'Recurrentes',
    'Preferencias',
    'Conexiones',
    'Cuenta',
  ]) {
    await openPart(page, part)
    expect(await tooSmall(CONTROLS), part).toEqual([])
    await backToIndex(page)
  }

  await openPart(page, 'Cuentas')
  await section(page).getByRole('button', { name: 'Nueva cuenta' }).click()
  await expect(page.getByRole('dialog', { name: 'Nueva cuenta' })).toBeVisible()
  expect(await tooSmall('dialog[open] :is(button, a[href], input, select)')).toEqual([])
})

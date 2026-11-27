import { readFile } from 'node:fs/promises'
import type { Page } from '@playwright/test'
import type { Month } from '../../src/lib/month'
import { test, expect } from './fixtures'
import { typeOnKeypad } from './entry-keypad'
import { editScenarioState } from './seed-sync-v2'

/**
 * Datos in the mobile frame (#447), in the mobile project. Each test that exports adds a movement
 * of its own so the file carries something recognizable. Wording and counts
 * are the view-model's unit tests'; here, what the user does and what they get.
 */
const section = (page: Page) => page.locator('#data')
const MOVEMENT = 'e2e-copia-movil'

async function seedMovement(page: Page): Promise<void> {
  await page.goto('/datos')
  await expect(page.locator('html[data-finance-ready="true"]')).toBeVisible()
  await editScenarioState(page, (state) => {
    state.transactions.push({
      id: MOVEMENT,
      date: '2026-03-10',
      month: 3 as Month,
      type: 'expense',
      accountId: state.accounts[0].id,
      category: 'Comida',
      description: MOVEMENT,
      amount: 7.5,
    })
  })
}

test('exporta la copia completa y los movimientos desde el móvil', async ({
  page,
  tracker,
}, testInfo) => {
  await seedMovement(page)
  await tracker.openData()
  await expect(section(page).getByRole('heading', { name: 'Datos', level: 1 })).toBeVisible()

  const jsonDownload = page.waitForEvent('download')
  await section(page)
    .getByRole('button', { name: /Exportar copia completa/ })
    .click()
  const json = await jsonDownload
  expect(json.suggestedFilename()).toMatch(/^finance-tracker-.*\.json$/)
  const jsonPath = testInfo.outputPath('copia.json')
  await json.saveAs(jsonPath)
  expect(await readFile(jsonPath, 'utf8')).toContain(MOVEMENT)
  await expect(section(page).locator('[data-last-export]')).toHaveText('Último: JSON exportado.')

  const csvDownload = page.waitForEvent('download')
  await section(page)
    .getByRole('button', { name: /Exportar movimientos/ })
    .click()
  const csv = await csvDownload
  expect(csv.suggestedFilename()).toMatch(/^movimientos-\d{4}\.csv$/)
  const csvPath = testInfo.outputPath('movimientos.csv')
  await csv.saveAs(csvPath)
  expect(await readFile(csvPath, 'utf8')).toContain(MOVEMENT)
  await expect(section(page).locator('[data-last-export]')).toHaveText('Último: CSV exportado.')
})

test('enseña la cola sin conexión bajo la línea de sincronización y la envía', async ({
  page,
  context,
  tracker,
}) => {
  await tracker.goto()
  await tracker.openData()
  const sync = section(page).locator('[data-data-sync]')
  await expect(sync.locator('[data-sync-label]')).toHaveText('Sincronizado')
  await expect(sync.locator('[data-sync-queue-toggle]')).toBeHidden()

  await context.setOffline(true)
  await expect(sync.locator('[data-sync-label]')).toHaveText('Sin conexión')

  await page.locator('[data-fab-apuntar]').click()
  const sheet = page.getByRole('dialog', { name: 'Nuevo movimiento' })
  await typeOnKeypad(sheet, '12,5')
  await sheet.getByLabel('Nota').fill('e2e-cola')
  await sheet.getByRole('button', { name: 'Guardar' }).click()
  await expect(sheet).toBeHidden()

  const toggle = sync.getByRole('button', { name: 'Ver el cambio pendiente' })
  await expect(sync.locator('[data-sync-queue]')).toBeHidden()
  await toggle.click()
  await expect(sync.locator('[data-sync-queue]')).toContainText('e2e-cola')
  await expect(sync.getByRole('button', { name: 'Ocultar el cambio pendiente' })).toBeVisible()

  await context.setOffline(false)
  await sync.getByRole('button', { name: 'Sincronizar ahora' }).click()
  await expect(sync.locator('[data-sync-label]')).toHaveText('Sincronizado')
  await expect(sync.locator('[data-sync-queue]')).toBeHidden()
})

test('todos los controles miden al menos 44 px con puntero táctil', async ({ page, tracker }) => {
  expect(await page.evaluate(() => matchMedia('(pointer: coarse)').matches)).toBe(true)

  const tooSmall = () =>
    page.locator('#data :is(button, a[href], input, select)').evaluateAll((controls) =>
      controls
        .filter((control) => control.getClientRects().length > 0)
        .map((control) => {
          const { width, height } = control.getBoundingClientRect()
          const name = control.getAttribute('aria-label') || control.textContent?.trim()
          return { name, width: Math.round(width), height: Math.round(height) }
        })
        .filter(({ width, height }) => width < 44 || height < 44),
    )

  await tracker.goto()
  await tracker.openData()
  expect(await tooSmall()).toEqual([])

  await section(page).locator('[data-import-toggle]').click()
  await expect(section(page).locator('[data-import-flow]')).toBeVisible()
  expect(await tooSmall()).toEqual([])

  await section(page).locator('[data-origin="json"]').click()
  await section(page)
    .locator('#import-json')
    .setInputFiles({
      name: 'copia.json',
      mimeType: 'application/json',
      buffer: Buffer.from('{}'),
    })
  await expect(section(page).getByRole('button', { name: 'Sustituir mis datos' })).toBeVisible()
  expect(await tooSmall()).toEqual([])

  await section(page).getByRole('button', { name: 'Empezar de cero' }).click()
  await expect(section(page).getByRole('alertdialog')).toBeVisible()
  expect(await tooSmall()).toEqual([])
})

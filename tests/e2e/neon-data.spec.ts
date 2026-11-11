import { readFile } from 'node:fs/promises'
import type { Page } from '@playwright/test'
import type { Month } from '../../src/lib/month'
import { test, expect } from './fixtures'
import { editScenarioState, readScenarioState } from './seed-sync-v2'

/**
 * Datos in the new design (#446), desktop. No cookie: the new design is the
 * default. The seed has accounts and movements; each test adds one movement of
 * its own so the file it exports carries something recognizable.
 */
const NO_COOKIE = { cookies: [], origins: [] }

test.use({ storageState: NO_COOKIE })

const section = (page: Page) => page.locator('#data')
const MOVEMENT = 'e2e-copia'

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

test.describe('Datos en el diseño nuevo', () => {
  test(
    'exporta la copia completa y los movimientos en CSV',
    { tag: '@smoke' },
    async ({ page, tracker }, testInfo) => {
      await seedMovement(page)
      await tracker.openData()
      await expect(section(page).getByRole('heading', { name: 'Datos', level: 1 })).toBeVisible()

      const contents = section(page).locator('[data-export-contents]')
      await expect(contents).toContainText(/Contiene\s+[1-9][\d.]*\s+movimientos?/)

      const jsonDownload = page.waitForEvent('download')
      await section(page).getByRole('button', { name: 'Exportar JSON' }).click()
      const json = await jsonDownload
      expect(json.suggestedFilename()).toMatch(/^finance-tracker-.*\.json$/)
      const jsonPath = testInfo.outputPath('copia.json')
      await json.saveAs(jsonPath)
      expect(await readFile(jsonPath, 'utf8')).toContain(MOVEMENT)
      await expect(section(page).locator('[data-last-export]')).toHaveText(
        'Último: JSON exportado.',
      )

      const csvDownload = page.waitForEvent('download')
      await section(page).getByRole('button', { name: 'Exportar CSV' }).click()
      const csv = await csvDownload
      expect(csv.suggestedFilename()).toMatch(/^movimientos-\d{4}\.csv$/)
      const csvPath = testInfo.outputPath('movimientos.csv')
      await csv.saveAs(csvPath)
      expect(await readFile(csvPath, 'utf8')).toContain(MOVEMENT)
      await expect(section(page).locator('[data-last-export]')).toHaveText('Último: CSV exportado.')
    },
  )

  test('importa una copia JSON y ve sus movimientos', async ({
    page,
    tracker,
    testUserEmail,
  }, testInfo) => {
    await seedMovement(page)
    await tracker.openData()

    const download = page.waitForEvent('download')
    await section(page).getByRole('button', { name: 'Exportar JSON' }).click()
    const backup = testInfo.outputPath('copia.json')
    await (await download).saveAs(backup)

    // Wipe the space, so what comes back can only come from the file.
    const reset = await page.request.post('/api/state/reset', {
      data: {},
      headers: {
        'X-Test-User-Email': testUserEmail,
        Origin: new URL(page.url()).origin,
        Referer: page.url(),
      },
    })
    expect(reset.ok(), await reset.text()).toBe(true)
    await tracker.reload()
    expect((await readScenarioState(page)).transactions).toHaveLength(0)

    await tracker.openData()
    await section(page)
      .getByRole('button', { name: /Importar/ })
      .click()
    await expect(section(page).locator('[data-import-step]')).toHaveText(
      'Paso 1 de 2 · Elige de dónde viene',
    )
    // The file picker opens from «Archivo JSON»; the test hands the file to its input.
    await section(page).locator('#import-json').setInputFiles(backup)

    await expect(section(page).locator('[data-import-step]')).toHaveText(
      'Paso 2 de 2 · Revisa antes de confirmar',
    )
    await expect(section(page).locator('[data-import-flow]')).toContainText('copia.json')
    const imported = page.waitForResponse((response) =>
      response.url().includes('/api/data/import?mode=replace'),
    )
    const reloaded = page.waitForEvent('framenavigated', (frame) => frame === page.mainFrame())
    await section(page).getByRole('button', { name: 'Sustituir mis datos' }).click()
    expect((await imported).ok()).toBe(true)
    await reloaded
    await expect(page.locator('html[data-finance-ready="true"]')).toBeVisible()

    await tracker.openTransactions()
    await expect(tracker.transactionsSection.getByText(MOVEMENT).first()).toBeVisible()
  })

  test('muestra lo que espera en la cola sin conexión y lo envía al sincronizar', async ({
    page,
    context,
    tracker,
  }) => {
    await tracker.goto()
    await tracker.openData()
    await expect(section(page).locator('[data-sync-label]')).toHaveText('Sincronizado')
    await expect(section(page).locator('[data-sync-pending]')).toHaveText('0')

    await context.setOffline(true)
    await expect(section(page).locator('[data-sync-label]')).toHaveText('Sin conexión')

    await page.locator('[data-sidebar-apuntar]').click()
    const sheet = page.getByRole('dialog', { name: 'Apuntar' })
    await sheet.getByRole('textbox', { name: 'Importe' }).fill('12,5')
    await sheet.getByLabel('Descripción').fill('e2e-cola')
    await sheet.getByRole('button', { name: 'Guardar' }).click()
    await expect(sheet).toBeHidden()

    await expect(section(page).locator('[data-sync-pending]')).toHaveText('1')
    await expect(section(page).locator('[data-sync-queue]')).toContainText('e2e-cola')
    await expect(section(page).locator('[data-sync-queue]')).toContainText('Crear')

    // A restore would drop the waiting change, so the import asks to send it first.
    await section(page)
      .getByRole('button', { name: /Importar/ })
      .click()
    await section(page).locator('[data-origin="json"]').click()
    await section(page)
      .locator('#import-json')
      .setInputFiles({
        name: 'copia.json',
        mimeType: 'application/json',
        buffer: Buffer.from('{}'),
      })
    await expect(section(page).locator('[data-import-blocked]')).toContainText(
      'Hay cambios sin sincronizar',
    )
    await expect(section(page).getByRole('button', { name: 'Sustituir mis datos' })).toBeDisabled()

    await context.setOffline(false)
    await section(page).getByRole('button', { name: 'Sincronizar ahora' }).first().click()
    await expect(section(page).locator('[data-sync-pending]')).toHaveText('0')
    await expect(section(page).locator('[data-import-blocked]')).toBeHidden()
    await expect(section(page).getByRole('button', { name: 'Sustituir mis datos' })).toBeEnabled()
  })
})

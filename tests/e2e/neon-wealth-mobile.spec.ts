import type { Page } from '@playwright/test'
import { test, expect } from './fixtures'

/**
 * Patrimonio en el diseño nuevo, marco móvil (#436), en el proyecto móvil.
 * Sin cookie: el diseño nuevo es el de por defecto. Las cifras las prueba el
 * unit del view-model; aquí, el recorrido: abrir una cuenta en su hoja, leer
 * otro mes y volver, y que todo se pueda pulsar con el dedo.
 */
const NO_COOKIE = { cookies: [], origins: [] }

test.use({ storageState: NO_COOKIE, fixedTime: '2026-03-20T12:00:00Z' })

const section = (page: Page) => page.locator('#wealth')

test('abre el detalle de una cuenta en una hoja, lee otro mes y vuelve', async ({
  page,
  tracker,
}) => {
  await tracker.openWealth()
  await expect(section(page).getByRole('heading', { name: 'Patrimonio', level: 1 })).toBeVisible()

  const row = section(page).getByRole('button', { name: /^Revolut: / })
  await row.click()
  const sheet = page.getByRole('dialog', { name: 'Revolut' })
  await expect(sheet).toBeVisible()
  // Una hoja inferior: pegada al borde de abajo, no un panel lateral.
  const box = await sheet.boundingBox()
  const viewport = page.viewportSize()
  expect(
    box && viewport && box.y > 0 && Math.round(box.y + box.height) >= viewport.height - 1,
  ).toBe(true)

  await sheet
    .getByRole('group', { name: 'Saldo de Revolut mes a mes' })
    .getByRole('button', { name: /^Febrero: / })
    .click()
  await expect(sheet.locator('[data-account-value]')).toHaveText('1.299,11 €')

  await sheet.getByRole('button', { name: 'Cerrar' }).click()
  await expect(sheet).toBeHidden()
  await expect(row).toBeFocused()
})

test('todos los controles de Patrimonio miden al menos 44 px con puntero táctil', async ({
  page,
  tracker,
}) => {
  await tracker.openWealth()
  expect(await page.evaluate(() => matchMedia('(pointer: coarse)').matches)).toBe(true)

  const tooSmall = (selector: string) =>
    page.locator(selector).evaluateAll((controls) =>
      controls
        .filter((control) => control.getClientRects().length > 0)
        .map((control) => {
          const { width, height } = control.getBoundingClientRect()
          const name = control.getAttribute('aria-label') || control.textContent?.trim()
          return { name, width: Math.round(width), height: Math.round(height) }
        })
        .filter(({ width, height }) => width < 44 || height < 44),
    )
  const CONTROLS = 'button, a[href], input'

  expect(await tooSmall(`#wealth :is(${CONTROLS})`)).toEqual([])

  await section(page)
    .getByRole('button', { name: /^Revolut: / })
    .click()
  await expect(page.getByRole('dialog', { name: 'Revolut' })).toBeVisible()
  expect(await tooSmall(`dialog[open] :is(${CONTROLS})`)).toEqual([])
  await page.keyboard.press('Escape')

  await section(page).getByRole('button', { name: 'Cerrar marzo' }).click()
  await expect(
    section(page).getByRole('heading', { name: 'Balance por meses', level: 1 }),
  ).toBeVisible()
  expect(await tooSmall(`#wealth :is(${CONTROLS})`)).toEqual([])
})

import type { Page } from '@playwright/test'
import { test, expect } from './fixtures'

/**
 * Patrimonio en el marco móvil (#436), en el proyecto móvil.
 * Las cifras las prueba el
 * unit del view-model; aquí, abrir un mes cerrado desde el historial y que todo
 * se pueda pulsar con el dedo.
 */
test.use({ fixedTime: '2026-03-20T12:00:00Z' })

const section = (page: Page) => page.locator('#wealth')

test('abre un mes desde el historial y lee sus saldos', async ({ page, tracker }) => {
  await tracker.openWealth()
  await section(page).getByRole('button', { name: 'Por meses' }).click()
  await expect(
    section(page).getByRole('heading', { name: 'Balance por meses', level: 1 }),
  ).toBeVisible()

  await section(page)
    .getByRole('button', { name: /^Febrero, cerrado: / })
    .click()
  await expect(section(page).getByRole('heading', { name: 'Saldos de febrero' })).toBeVisible()
  await expect(section(page).locator('[data-wealth-status]')).toHaveText('Febrero cerrado')
  await expect(
    section(page).getByRole('textbox', { name: 'Saldo de Revolut en febrero' }),
  ).toBeVisible()
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

  await section(page).getByRole('button', { name: 'Cerrar marzo', exact: true }).click()
  await expect(
    section(page).getByRole('heading', { name: 'Balance por meses', level: 1 }),
  ).toBeVisible()
  expect(await tooSmall(`#wealth :is(${CONTROLS})`)).toEqual([])
  await section(page).getByRole('button', { name: 'Historial' }).click()
  await expect(section(page).getByRole('heading', { name: 'Cada mes' })).toBeVisible()
  expect(await tooSmall(`#wealth :is(${CONTROLS})`)).toEqual([])
})

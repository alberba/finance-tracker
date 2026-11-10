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

test('abre el detalle de una cuenta en una hoja y vuelve', async ({ page, tracker }) => {
  await tracker.openWealth()
  await expect(section(page).getByRole('heading', { name: 'Patrimonio', level: 1 })).toBeVisible()

  const row = section(page).getByRole('button', { name: /^Revolut: / })
  await row.click()
  const sheet = page.getByRole('dialog', { name: 'Revolut' })
  await expect(sheet).toBeVisible()
  await expect(sheet.locator('[data-account-value]')).toHaveText('3.101,32 €')

  await sheet.getByRole('button', { name: 'Cerrar' }).click()
  await expect(sheet).toBeHidden()
  await expect(row).toBeFocused()
})

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

test('el título está en la barra superior y no en el contenido', async ({ page, tracker }) => {
  await tracker.openWealth()
  const bar = page.locator('[data-mobile-app-bar]')

  await expect(bar.locator('[data-bar-title]')).toHaveText('Patrimonio')
  await expect(bar.locator('p[aria-label="finanzas"]')).toBeHidden()
  // El contenido conserva el encabezado para lectores de pantalla y foco, sin dibujarlo.
  const heading = section(page).getByRole('heading', { name: 'Patrimonio', level: 1 })
  await expect(heading).toBeAttached()
  expect((await heading.boundingBox())!.width).toBeLessThanOrEqual(1)

  await section(page).getByRole('button', { name: 'Por meses' }).click()
  await expect(bar.locator('[data-bar-title]')).toHaveCount(0)
  await expect(bar.locator('p[aria-label="finanzas"]')).toBeVisible()
})

test('recorre el gráfico con el dedo y al soltar vuelve a hoy', async ({ page, tracker }) => {
  await tracker.openWealth()
  const net = section(page).locator('[data-wealth-net]')
  const reading = section(page).locator('[data-wealth-reading]')
  const atRest = await net.textContent()
  const plot = (await section(page).locator('[data-wealth-plot]').boundingBox())!
  const y = plot.y + plot.height / 3

  const cdp = await page.context().newCDPSession(page)
  const touch = (type: 'touchStart' | 'touchMove' | 'touchEnd', x?: number, at = y) =>
    cdp.send('Input.dispatchTouchEvent', {
      type,
      touchPoints: x === undefined ? [] : [{ x, y: at }],
    })

  // Un gesto vertical antes de mantener es de la página: no lee el gráfico.
  await touch('touchStart', plot.x + 60)
  await touch('touchMove', plot.x + 60, y + 40)
  await page.waitForTimeout(300)
  await expect(reading).toBeHidden()
  await touch('touchEnd')

  // Mantener y deslizar lee punto a punto.
  await touch('touchStart', plot.x + 4)
  await expect(reading).toHaveText('Enero')
  const january = await net.textContent()
  expect(january).not.toBe(atRest)
  await expect(section(page).locator('[data-wealth-marker]')).toBeVisible()

  await touch('touchMove', plot.x + plot.width - 4)
  await expect(reading).not.toHaveText('Enero')
  await expect(net).not.toHaveText(january!)

  await touch('touchEnd')
  await expect(reading).toBeHidden()
  await expect(net).toHaveText(atRest!)
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

  await section(page).getByRole('button', { name: 'Reparto' }).click()
  await expect(section(page).getByRole('heading', { name: 'Dónde está' })).toBeVisible()
  expect(await tooSmall(`#wealth :is(${CONTROLS})`)).toEqual([])
  await section(page).getByRole('button', { name: 'Cuentas', exact: true }).click()

  await section(page)
    .getByRole('button', { name: /^Revolut: / })
    .click()
  await expect(page.getByRole('dialog', { name: 'Revolut' })).toBeVisible()
  expect(await tooSmall(`dialog[open] :is(${CONTROLS})`)).toEqual([])
  await page.keyboard.press('Escape')

  await section(page).getByRole('button', { name: 'Cerrar mes', exact: true }).click()
  await expect(
    section(page).getByRole('heading', { name: 'Balance por meses', level: 1 }),
  ).toBeVisible()
  expect(await tooSmall(`#wealth :is(${CONTROLS})`)).toEqual([])
  await section(page).getByRole('button', { name: 'Historial' }).click()
  await expect(section(page).getByRole('heading', { name: 'Cada mes' })).toBeVisible()
  expect(await tooSmall(`#wealth :is(${CONTROLS})`)).toEqual([])
})

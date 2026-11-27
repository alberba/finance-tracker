import type { Page } from '@playwright/test'
import { test, expect } from './fixtures'

/**
 * The cover of Inversión in the mobile frame (#438), and an
 * asset's detail (#440), in the mobile project. The clock sits on
 * 20 March 2026, the newest month of the seed. Figures are the view-model's
 * unit tests'; here, what the user does and what they get.
 */
test.use({ fixedTime: '2026-03-20T12:00:00Z' })

const section = (page: Page) => page.locator('#investment')
const grip = (page: Page) => section(page).getByRole('button', { name: /la lista de posiciones$/ })
// How the return is measured is the link at the end of the gain line.
const method = (page: Page, name: string) => section(page).getByRole('button', { name })

test.beforeEach(async ({ tracker }) => {
  await tracker.openInvestment()
})

test('abre un activo desde la portada, entra en sus movimientos y vuelve con atrás y con la flecha', async ({
  page,
}) => {
  const bar = page.locator('[data-mobile-app-bar]')
  await expect(section(page).getByRole('heading', { name: 'Inversión', level: 1 })).toBeVisible()

  await section(page).getByRole('button', { name: 'Ver Fondos Indexados' }).click()
  await expect(page).toHaveURL(/\/inversion\?activo=[^&]+$/)
  // The detail header in the top bar: the arrow and the asset, nothing on the right.
  await expect(bar.getByRole('link', { name: 'Volver a Inversión' })).toBeVisible()
  await expect(bar.getByRole('heading', { level: 1 })).toBeVisible()
  await expect(bar.getByRole('button', { name: 'Buscar' })).toBeHidden()
  await expect(section(page).getByRole('heading', { name: 'Inversión', level: 1 })).toHaveCount(0)
  await expect(section(page).getByRole('heading', { name: 'Tu posición' })).toBeVisible()
  await expect(section(page).getByText('Has puesto')).toBeVisible()

  await section(page)
    .getByRole('button', { name: /^Ver tus movimientos/ })
    .click()
  await expect(page).toHaveURL(/vista=movimientos/)
  await expect(section(page).getByRole('heading', { name: 'Movimientos' })).toBeVisible()
  await expect(section(page).getByText('Aportación fondo indexado').first()).toBeVisible()
  await expect(section(page).getByRole('button', { name: 'Comprar' })).toBeVisible()

  // Back goes from the movements to the summary, the arrow from there to the cover.
  await page.goBack()
  await expect(page).toHaveURL(/\/inversion\?activo=[^&]+$/)
  await expect(section(page).getByRole('heading', { name: 'Tu posición' })).toBeVisible()
  await bar.getByRole('link', { name: 'Volver a Inversión' }).click()
  await expect(page).toHaveURL(/\/inversion$/)
  await expect(section(page).getByRole('heading', { name: 'Inversión', level: 1 })).toBeVisible()
  await expect(bar.getByRole('button', { name: 'Buscar' })).toBeVisible()

  // From the movements, the arrow goes back to the summary.
  await section(page).getByRole('button', { name: 'Ver Fondos Indexados' }).click()
  await section(page)
    .getByRole('button', { name: /^Ver tus movimientos/ })
    .click()
  await expect(section(page).getByRole('heading', { name: 'Movimientos' })).toBeVisible()
  await bar.getByRole('link', { name: /^Volver a / }).click()
  await expect(section(page).getByRole('heading', { name: 'Tu posición' })).toBeVisible()
  await page.goBack()
  await expect(page).toHaveURL(/\/inversion$/)
  await expect(section(page).getByRole('heading', { name: 'Inversión', level: 1 })).toBeVisible()
})

test('la hoja de posiciones oculta el gráfico al abrirla y lo devuelve al cerrarla', async ({
  page,
}) => {
  const chart = section(page).locator('[data-investment-chart]')
  await expect(chart).toBeVisible()
  await expect(grip(page)).toHaveAttribute('aria-expanded', 'false')

  await grip(page).click()
  await expect(grip(page)).toHaveAttribute('aria-expanded', 'true')
  await expect(chart).toBeHidden()
  // The figures stay over the sheet, with their way of measuring the return.
  await expect(method(page, 'sobre lo aportado')).toBeVisible()
  await expect(section(page).getByRole('button', { name: 'Ver Fondos Indexados' })).toBeVisible()

  await grip(page).click()
  await expect(grip(page)).toHaveAttribute('aria-expanded', 'false')
  await expect(chart).toBeVisible()
})

test('recorrer el gráfico enseña el valor de ese mes y al soltar vuelve a hoy', async ({
  page,
}) => {
  const figures = section(page).locator('[data-investment-figures]')
  await expect(figures).toContainText('Vale hoy')

  const slider = section(page).getByRole('slider', { name: 'Recorrer la evolución' })
  const box = await slider.boundingBox()
  if (!box) throw new Error('El gráfico no tiene caja')
  await page.mouse.move(box.x + box.width * 0.35, box.y + box.height / 2)
  await page.mouse.down()
  await expect(figures).toContainText(/(Inicio de|ene|feb|mar) 2026/)
  await expect(figures).not.toContainText('Vale hoy')

  await page.mouse.up()
  await page.mouse.move(box.x + box.width / 2, box.y - 40)
  await expect(figures).toContainText('Vale hoy')
})

test('cambia la rentabilidad de importe a TWR desde el enlace de las cifras', async ({ page }) => {
  const figures = section(page).locator('[data-investment-figures]')
  await expect(figures).toContainText(/[+−]\d[\d.]*\s€/)

  await method(page, 'sobre lo aportado').click()
  await page.getByRole('menuitemradio', { name: /^Por tiempo \(TWR\)/ }).click()

  await expect(method(page, 'por tiempo (TWR)')).toBeVisible()
  await expect(figures).not.toContainText(/[+−]\d[\d.]*\s€/)
  await expect(
    section(page).locator('[data-investment-chart]').getByRole('img'),
  ).toHaveAccessibleName(/^Rentabilidad TWR acumulada/)
})

test.describe('cómo medir la rentabilidad en una pantalla estrecha', () => {
  test.use({ fixedTime: '2026-11-27T12:00:00Z', reducedMotion: 'reduce' })

  test('abre bajo el enlace sin salirse de la pantalla y permite elegir con el teclado', async ({
    page,
  }) => {
    await page.setViewportSize({ width: 320, height: 720 })
    const trigger = method(page, 'sobre lo aportado')
    await expect(trigger).toBeInViewport({ ratio: 1 })
    const before = await trigger.boundingBox()
    if (!before) throw new Error('El enlace de la rentabilidad no tiene caja')
    await trigger.click()

    const menu = page.getByRole('menu', { name: 'Cómo medir la rentabilidad' })
    await expect(menu).toBeInViewport({ ratio: 1 })
    const bounds = await menu.boundingBox()
    if (!bounds) throw new Error('El menú de la rentabilidad no se ha abierto')
    expect(bounds.x).toBeGreaterThanOrEqual(0)
    expect(bounds.x + bounds.width).toBeLessThanOrEqual(320)
    expect(bounds.y).toBeGreaterThanOrEqual(before.y + before.height)
    expect((await trigger.boundingBox())?.y).toBe(before.y)

    await expect(menu.getByRole('menuitemradio', { name: /^Sobre lo aportado/ })).toBeFocused()
    await page.keyboard.press('End')
    await expect(menu.getByRole('menuitemradio', { name: /^Por tiempo \(TWR\)/ })).toBeFocused()
    await page.keyboard.press('Home')
    await expect(menu.getByRole('menuitemradio', { name: /^Sobre lo aportado/ })).toBeFocused()
    await page.keyboard.press('ArrowDown')
    await page.keyboard.press('Enter')

    await expect(menu).toBeHidden()
    await expect(method(page, 'por tiempo (TWR)')).toBeFocused()
  })
})

test('las comisiones y las caídas se abren en su panel y se cierran', async ({ page }) => {
  await page.setViewportSize({ width: 320, height: 720 })
  await section(page).getByRole('button', { name: 'Comisiones' }).click()
  const fees = page.getByRole('dialog', { name: 'Comisiones' })
  await expect(fees).toBeVisible()
  await expect(fees.getByText('Sobre lo aportado')).toBeVisible()
  await fees.getByRole('button', { name: 'Cerrar' }).click()
  await expect(fees).toBeHidden()

  await section(page).getByRole('button', { name: 'Caídas máximas' }).click()
  await expect(page.getByRole('dialog', { name: 'Caídas máximas' })).toBeVisible()
})

test('todos los controles de la portada miden al menos 44 px con puntero táctil', async ({
  page,
}) => {
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

  const CONTROLS = 'button, a[href], input, [role="menuitemradio"]'
  expect(await tooSmall(`#investment :is(${CONTROLS})`)).toEqual([])

  await method(page, 'sobre lo aportado').click()
  await expect(page.getByRole('menu', { name: 'Cómo medir la rentabilidad' })).toBeVisible()
  expect(await tooSmall(`#investment :is(${CONTROLS})`)).toEqual([])
  await page.keyboard.press('Escape')

  // The asset's detail: its summary, its movements and the bar's arrow.
  const DETAIL = `:is(#investment, [data-mobile-app-bar]) :is(${CONTROLS})`
  await section(page).getByRole('button', { name: 'Ver Fondos Indexados' }).click()
  await expect(section(page).getByRole('heading', { name: 'Tu posición' })).toBeVisible()
  expect(await tooSmall(DETAIL)).toEqual([])
  await section(page)
    .getByRole('button', { name: /^Ver tus movimientos/ })
    .click()
  await expect(section(page).getByRole('heading', { name: 'Movimientos' })).toBeVisible()
  expect(await tooSmall(DETAIL)).toEqual([])
})

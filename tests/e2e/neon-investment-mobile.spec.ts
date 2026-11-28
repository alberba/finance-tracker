import { test, expect } from './fixtures'
import type { FinanceTrackerPage } from './pages/FinanceTrackerPage'
import { holdVwceInFondos } from './seed-sync-v2'

/**
 * The cover of Inversión in the mobile frame (#438), and an
 * asset's detail (#440), in the mobile project. The clock sits on
 * 20 March 2026, the newest month of the seed. Figures are the view-model's
 * unit tests'; here, what the user does and what they get.
 */
test.use({ fixedTime: '2026-03-20T12:00:00Z' })

// How the return is measured is the link at the end of the gain line.
const method = (tracker: FinanceTrackerPage, name: string) =>
  tracker.investmentSection.getByRole('button', { name })

test.beforeEach(async ({ tracker }) => {
  await tracker.openInvestment()
})

test('abre un activo desde la portada, entra en sus movimientos y vuelve con atrás y con la flecha', async ({
  page,
  tracker,
}) => {
  const bar = page.locator('[data-mobile-app-bar]')
  await expect(
    tracker.investmentSection.getByRole('heading', { name: 'Inversión', level: 1 }),
  ).toBeVisible()

  await tracker.investmentSection.getByRole('button', { name: 'Ver Fondos Indexados' }).click()
  await expect(page).toHaveURL(/\/inversion\?activo=[^&]+$/)
  // The detail header in the top bar: the arrow and the asset, nothing on the right.
  await expect(bar.getByRole('link', { name: 'Volver a Inversión' })).toBeVisible()
  await expect(bar.getByRole('heading', { level: 1 })).toBeVisible()
  await expect(
    tracker.investmentSection.getByRole('heading', { name: 'Inversión', level: 1 }),
  ).toHaveCount(0)
  await expect(
    tracker.investmentSection.getByRole('heading', { name: 'Tu posición' }),
  ).toBeVisible()
  await expect(tracker.investmentSection.getByText('Has puesto', { exact: true })).toBeVisible()
  // The movements with no instrument close the account's positions as one row.
  await expect(tracker.uninstrumentedPosition).toContainText('Sin instrumento')

  await tracker.investmentSection.getByRole('button', { name: /^Ver tus movimientos/ }).click()
  await expect(page).toHaveURL(/vista=movimientos/)
  await expect(
    tracker.investmentSection.getByRole('heading', { name: 'Movimientos' }),
  ).toBeVisible()
  await expect(
    tracker.investmentSection.getByText('Aportación fondo indexado').first(),
  ).toBeVisible()
  await expect(tracker.investmentSection.getByRole('button', { name: 'Comprar' })).toBeVisible()

  // Back goes from the movements to the summary, the arrow from there to the cover.
  await page.goBack()
  await expect(page).toHaveURL(/\/inversion\?activo=[^&]+$/)
  await expect(
    tracker.investmentSection.getByRole('heading', { name: 'Tu posición' }),
  ).toBeVisible()
  await bar.getByRole('link', { name: 'Volver a Inversión' }).click()
  await expect(page).toHaveURL(/\/inversion$/)
  await expect(
    tracker.investmentSection.getByRole('heading', { name: 'Inversión', level: 1 }),
  ).toBeVisible()

  // From the movements, the arrow goes back to the summary.
  await tracker.investmentSection.getByRole('button', { name: 'Ver Fondos Indexados' }).click()
  await tracker.investmentSection.getByRole('button', { name: /^Ver tus movimientos/ }).click()
  await expect(
    tracker.investmentSection.getByRole('heading', { name: 'Movimientos' }),
  ).toBeVisible()
  await bar.getByRole('link', { name: /^Volver a / }).click()
  await expect(
    tracker.investmentSection.getByRole('heading', { name: 'Tu posición' }),
  ).toBeVisible()
  await page.goBack()
  await expect(page).toHaveURL(/\/inversion$/)
  await expect(
    tracker.investmentSection.getByRole('heading', { name: 'Inversión', level: 1 }),
  ).toBeVisible()
})

test('abre un instrumento desde las posiciones de su cuenta y vuelve con la flecha y con atrás', async ({
  page,
  tracker,
}) => {
  await holdVwceInFondos(page)
  await tracker.openInvestment()
  const bar = page.locator('[data-mobile-app-bar]')

  await tracker.investmentSection.getByRole('button', { name: 'Ver Fondos Indexados' }).click()
  await tracker.investmentSection.getByRole('link', { name: 'VWCE' }).click()
  await expect(page).toHaveURL(/\/inversion\?instrumento=[^&]+$/)
  await expect(bar.getByRole('heading', { level: 1 })).toHaveText('VWCE')
  await expect(tracker.instrumentTotal).toContainText('15 títulos')
  await expect(
    tracker.investmentSection.getByRole('heading', { name: 'Movimientos' }),
  ).toBeVisible()

  await tracker.reload()
  await expect(bar.getByRole('heading', { level: 1 })).toHaveText('VWCE')
  await expect(tracker.instrumentTotal).toContainText('15 títulos')

  // The reload kept the history entry: the arrow still goes back to the account it came from.
  await bar.getByRole('link', { name: 'Volver a Inversión' }).click()
  await expect(page).toHaveURL(/\/inversion\?activo=[^&]+$/)
  await expect(tracker.investmentSection.getByRole('heading', { name: 'Posiciones' })).toBeVisible()

  await bar.getByRole('link', { name: 'Volver a Inversión' }).click()
  await expect(page).toHaveURL(/\/inversion$/)
  await expect(
    tracker.investmentSection.getByRole('heading', { name: 'Inversión', level: 1 }),
  ).toBeVisible()
})

test.describe('cómo medir la rentabilidad en una pantalla estrecha', () => {
  test.use({ fixedTime: '2026-11-27T12:00:00Z', reducedMotion: 'reduce' })

  test('abre sin salirse de la pantalla y permite elegir TWR con el teclado', async ({
    page,
    tracker,
  }) => {
    await page.setViewportSize({ width: 320, height: 720 })
    const trigger = method(tracker, 'sobre lo aportado')
    await expect(trigger).toBeInViewport({ ratio: 1 })
    await trigger.click()

    const menu = page.getByRole('menu', { name: 'Cómo medir la rentabilidad' })
    await expect(menu).toBeInViewport({ ratio: 1 })

    await expect(menu.getByRole('menuitemradio', { name: /^Sobre lo aportado/ })).toBeFocused()
    await page.keyboard.press('End')
    await expect(menu.getByRole('menuitemradio', { name: /^Por tiempo \(TWR\)/ })).toBeFocused()
    await page.keyboard.press('Home')
    await expect(menu.getByRole('menuitemradio', { name: /^Sobre lo aportado/ })).toBeFocused()
    await page.keyboard.press('ArrowDown')
    await page.keyboard.press('Enter')

    await expect(menu).toBeHidden()
    await expect(method(tracker, 'por tiempo (TWR)')).toBeFocused()
  })
})

test('todos los controles de la portada miden al menos 44 px con puntero táctil', async ({
  page,
  tracker,
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

  await method(tracker, 'sobre lo aportado').click()
  await expect(page.getByRole('menu', { name: 'Cómo medir la rentabilidad' })).toBeVisible()
  expect(await tooSmall(`#investment :is(${CONTROLS})`)).toEqual([])
  await page.keyboard.press('Escape')

  // The asset's detail: its summary, its movements and the bar's arrow.
  const DETAIL = `:is(#investment, [data-mobile-app-bar]) :is(${CONTROLS})`
  await tracker.investmentSection.getByRole('button', { name: 'Ver Fondos Indexados' }).click()
  await expect(
    tracker.investmentSection.getByRole('heading', { name: 'Tu posición' }),
  ).toBeVisible()
  expect(await tooSmall(DETAIL)).toEqual([])
  await tracker.investmentSection.getByRole('button', { name: /^Ver tus movimientos/ }).click()
  await expect(
    tracker.investmentSection.getByRole('heading', { name: 'Movimientos' }),
  ).toBeVisible()
  expect(await tooSmall(DETAIL)).toEqual([])
})

test('agrupa la lista de la portada por instrumento y abre su detalle', async ({
  page,
  tracker,
}) => {
  await holdVwceInFondos(page)
  await tracker.openInvestment()
  const accounts = tracker.investmentAccounts
  await expect(accounts.getByRole('heading', { name: 'Cuentas' })).toBeVisible()

  await accounts.getByRole('button', { name: 'Por cuenta' }).click()
  await page
    .getByRole('menu', { name: 'Agrupar por' })
    .getByRole('menuitemradio', { name: 'Instrumento' })
    .click()
  await expect(accounts.getByRole('heading', { name: 'Instrumentos' })).toBeVisible()
  await expect(accounts.locator('[data-investment-account]')).toHaveCount(0)

  await accounts.getByRole('button', { name: 'Ver VWCE' }).click()
  await expect(page).toHaveURL(/\/inversion\?instrumento=[^&]+$/)
  await expect(tracker.investmentSection.getByRole('heading', { name: 'Posiciones' })).toBeVisible()
})

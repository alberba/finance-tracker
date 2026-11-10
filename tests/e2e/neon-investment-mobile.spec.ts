import type { Page } from '@playwright/test'
import { test, expect } from './fixtures'

/**
 * The cover of Inversión in the mobile frame of the new design (#438), in the
 * mobile project. No cookie: the new design is the default. The clock sits on
 * 20 March 2026, the newest month of the seed. Figures are the view-model's
 * unit tests'; here, what the user does and what they get.
 */
const NO_COOKIE = { cookies: [], origins: [] }

test.use({ storageState: NO_COOKIE, fixedTime: '2026-03-20T12:00:00Z' })

const section = (page: Page) => page.locator('#investment')
const grip = (page: Page) => section(page).getByRole('button', { name: /la lista de posiciones$/ })

test.beforeEach(async ({ tracker }) => {
  await tracker.openInvestment()
})

test('abre una posición desde la lista móvil y llega a su detalle', async ({ page }) => {
  await expect(section(page).getByRole('heading', { name: 'Inversión', level: 1 })).toBeVisible()
  await expect(section(page).locator('[data-investment-figure="return"]')).toContainText(
    'Tu cartera',
  )

  await section(page).getByRole('button', { name: 'Ver Fondos Indexados' }).click()
  const detail = page.getByRole('dialog', { name: 'Fondos Indexados' })
  await expect(detail).toBeVisible()
  await expect(detail.getByRole('heading', { name: 'Operaciones' })).toBeVisible()
  await expect(detail.getByText('Aportación fondo indexado').first()).toBeVisible()

  await detail.getByRole('button', { name: 'Cerrar' }).click()
  await expect(detail).toBeHidden()
})

test('la hoja de posiciones oculta el gráfico y los chips al abrirla y los devuelve al cerrarla', async ({
  page,
}) => {
  const chart = section(page).locator('[data-investment-chart]')
  const method = section(page).getByRole('button', { name: 'Rentabilidad simple' })
  await expect(chart).toBeVisible()
  await expect(method).toBeVisible()
  await expect(grip(page)).toHaveAttribute('aria-expanded', 'false')

  await grip(page).click()
  await expect(grip(page)).toHaveAttribute('aria-expanded', 'true')
  await expect(chart).toBeHidden()
  await expect(method).toBeHidden()
  await expect(section(page).getByRole('button', { name: 'Ver Fondos Indexados' })).toBeVisible()

  await grip(page).click()
  await expect(grip(page)).toHaveAttribute('aria-expanded', 'false')
  await expect(chart).toBeVisible()
  await expect(method).toBeVisible()
})

test('cambia la rentabilidad de importe a TWR desde los chips', async ({ page }) => {
  const figure = section(page).locator('[data-investment-figure="return"]')
  await expect(figure).toContainText('€')

  await section(page).getByRole('button', { name: 'Rentabilidad simple' }).click()
  await page.getByRole('menuitemradio', { name: /^TWR/ }).click()

  await expect(figure).toContainText('Tu cartera · TWR')
  await expect(figure).not.toContainText('€')
  await expect(
    section(page).locator('[data-investment-chart]').getByRole('img'),
  ).toHaveAccessibleName(/^Rentabilidad TWR acumulada/)
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

  await section(page).getByRole('button', { name: 'Rentabilidad simple' }).click()
  await expect(page.getByRole('menu', { name: 'Cómo medir la rentabilidad' })).toBeVisible()
  expect(await tooSmall(`#investment :is(${CONTROLS})`)).toEqual([])
  await page.keyboard.press('Escape')

  await section(page).getByRole('button', { name: 'Ver Fondos Indexados' }).click()
  await expect(page.getByRole('dialog', { name: 'Fondos Indexados' })).toBeVisible()
  expect(await tooSmall(`dialog[open] :is(${CONTROLS})`)).toEqual([])
})

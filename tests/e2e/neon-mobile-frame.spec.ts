import type { Page } from '@playwright/test'
import { test, expect } from './fixtures'
import type { FinanceSectionId } from './pages/FinanceTrackerPage'

/** Marco móvil del diseño nuevo (#425). No cookie: el diseño nuevo es el de por defecto. */
const NO_COOKIE = { cookies: [], origins: [] }

const bottomBar = (page: Page) => page.getByRole('navigation', { name: 'Navegación principal' })
const moreTrigger = (page: Page) => page.getByRole('button', { name: 'Más secciones' })
const moreSheet = (page: Page) => page.getByRole('dialog', { name: 'Más secciones' })
const current = (page: Page) => page.locator('#nav-tabs [aria-current="page"]:visible')

const BAR_SECTIONS: Array<[FinanceSectionId, string]> = [
  ['dashboard', 'Dashboard'],
  ['transactions', 'Movimientos'],
  ['budget', 'Presupuesto'],
]
const MORE_SECTIONS: Array<[FinanceSectionId, string]> = [
  ['wealth', 'Patrimonio'],
  ['investment', 'Inversión'],
  ['goals', 'Objetivos'],
  ['settings', 'Configuración'],
  ['data', 'Datos'],
]

test.describe('Marco móvil nuevo', () => {
  test.use({ storageState: NO_COOKIE })

  test.beforeEach(async ({ tracker }) => {
    await tracker.goto()
  })

  test('navega a cada sección desde la barra y desde «Más»', async ({ page, tracker }) => {
    await expect(page.locator('html')).toHaveAttribute('data-ui', 'neon')
    await expect(bottomBar(page)).toBeVisible()
    await expect(page.getByRole('complementary')).toBeHidden()

    for (const [id, label] of BAR_SECTIONS) {
      await bottomBar(page).getByRole('button', { name: label }).click()
      await expect(tracker.section(id)).toBeVisible()
      await expect(current(page)).toHaveAttribute('data-section', id)
      await expect(moreTrigger(page)).toHaveAttribute('data-active', 'false')
    }

    for (const [id, label] of MORE_SECTIONS) {
      await moreTrigger(page).click()
      await expect(moreSheet(page)).toBeVisible()
      await moreSheet(page).getByRole('button', { name: label }).click()
      await expect(moreSheet(page)).toBeHidden()
      await expect(tracker.section(id)).toBeVisible()
      await expect(moreTrigger(page)).toHaveAttribute('data-active', 'true')
    }
  })

  test('la hoja «Más» solo lleva lo que la barra no tiene, y cierra con su botón', async ({
    page,
  }) => {
    await moreTrigger(page).click()
    const names = await moreSheet(page)
      .getByRole('navigation', { name: 'Más secciones' })
      .getByRole('button')
      .allTextContents()
    expect(names.map((name) => name.trim())).toEqual(MORE_SECTIONS.map(([, label]) => label))

    await moreSheet(page).getByRole('button', { name: 'Cerrar menú' }).click()
    await expect(moreSheet(page)).toBeHidden()
  })

  test('cambia de diseño desde «Más»', async ({ page, tracker }) => {
    await moreTrigger(page).click()
    const toggle = moreSheet(page).getByRole('group', { name: 'Diseño' })
    await expect(toggle.getByRole('button', { name: 'Diseño nuevo' })).toHaveAttribute(
      'aria-pressed',
      'true',
    )
    await toggle.getByRole('button', { name: 'Diseño antiguo' }).click()
    await expect(page.locator('html')).toHaveAttribute('data-ui', 'legacy')

    await tracker.reload()
    await expect(page.locator('html')).toHaveAttribute('data-ui', 'legacy')
    await page.getByRole('button', { name: 'Más secciones' }).click()
    await page
      .getByRole('dialog', { name: 'Más secciones' })
      .getByRole('group', { name: 'Diseño' })
      .getByRole('button', { name: 'Diseño nuevo' })
      .click()
    await expect(page.locator('html')).toHaveAttribute('data-ui', 'neon')
  })

  test('«Apuntar» abre el alta de movimiento', async ({ page, tracker }) => {
    await page.getByRole('button', { name: 'Apuntar' }).click()
    await expect(tracker.section('transactions')).toBeVisible()
    await expect(tracker.transactionPanel).toBeVisible()
  })

  test('«Por confirmar» abre un popover que cierra con Escape y al pulsar fuera', async ({
    page,
  }) => {
    const trigger = page.getByRole('button', { name: /^Por confirmar/ })
    const popover = page.getByRole('dialog', { name: 'Por confirmar' })

    await trigger.click()
    await expect(popover).toBeVisible()
    await expect(popover.getByText('Todo al día')).toBeVisible()

    await page.keyboard.press('Escape')
    await expect(popover).toBeHidden()
    await expect(trigger).toBeFocused()

    await trigger.click()
    await expect(popover).toBeVisible()
    await page.mouse.click(10, 400)
    await expect(popover).toBeHidden()
  })

  test('todos los controles del marco miden al menos 44 px con puntero táctil', async ({
    page,
  }) => {
    expect(await page.evaluate(() => matchMedia('(pointer: coarse)').matches)).toBe(true)
    await moreTrigger(page).click()
    await expect(moreSheet(page)).toBeVisible()

    const small = await page
      .locator(
        'nav[aria-label="Navegación principal"] button, #mobile-more-menu button, [data-fab-apuntar], [data-pending-trigger]',
      )
      .evaluateAll((buttons) =>
        buttons
          .map((button) => {
            const { width, height } = button.getBoundingClientRect()
            return {
              name: button.textContent?.trim() || button.getAttribute('aria-label'),
              width,
              height,
            }
          })
          .filter(({ width, height }) => width < 44 || height < 44),
      )
    expect(small).toEqual([])
  })

  test('el marco lo decide el ancho de ventana, también en un escritorio estrecho', async ({
    page,
    tracker,
  }) => {
    await page.setViewportSize({ width: 1200, height: 800 })
    await expect(page.getByRole('complementary')).toBeVisible()
    await expect(bottomBar(page)).toBeHidden()
    await expect(page.getByRole('button', { name: 'Apuntar' })).toBeHidden()

    await page.setViewportSize({ width: 900, height: 800 })
    await expect(page.getByRole('complementary')).toBeHidden()
    await expect(bottomBar(page)).toBeVisible()
    await expect(page.getByRole('button', { name: 'Apuntar' })).toBeVisible()
    await tracker.open('dashboard')
  })
})

test.describe('Marco móvil nuevo en un escritorio estrecho', () => {
  test.use({ storageState: NO_COOKIE, hasTouch: false, isMobile: false })

  test('con puntero fino y 900 px se ve el marco móvil', async ({ page, tracker }) => {
    await tracker.reload()
    await page.setViewportSize({ width: 900, height: 800 })
    await expect(bottomBar(page)).toBeVisible()
    await expect(page.getByRole('complementary')).toBeHidden()
  })
})

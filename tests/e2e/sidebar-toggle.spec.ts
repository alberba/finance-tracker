import type { Page } from '@playwright/test'
import { syncV2Test as test, expect } from './fixtures'

const sidebar = (page: Page) => page.getByRole('complementary')
const sidebarNav = (page: Page) => page.getByRole('navigation', { name: 'Secciones del tracker' })
const toggle = (page: Page) => page.locator('#sidebar-toggle')
const html = (page: Page) => page.locator('html')

test.describe('Sidebar toggle', () => {
  test('la inicialización del sidebar no lanza errores en carga', async ({ page, tracker }) => {
    const pageErrors: string[] = []
    page.on('pageerror', (error) => {
      pageErrors.push(error.message)
    })

    await tracker.goto()
    await expect(page.locator('html[data-finance-ready="true"]')).toBeVisible()
    await expect(page.locator('#dashboard')).toBeVisible()

    expect(pageErrors).toEqual([])
  })

  test('el botón de toggle existe y tiene el aria-label correcto', async ({ page, tracker }) => {
    await tracker.goto()
    await expect(toggle(page)).toBeVisible()
    await expect(toggle(page)).toHaveAttribute('aria-label', 'Colapsar barra lateral')
    await expect(toggle(page)).toHaveAttribute('aria-expanded', 'true')
  })

  test('colapsado, el logo queda centrado encima del nav', async ({ page, tracker }) => {
    await tracker.goto()
    const logo = sidebar(page).locator('header img')

    await toggle(page).click()
    await expect(html(page)).toHaveAttribute('data-sidebar', 'collapsed')
    await expect
      .poll(() => sidebar(page).evaluate((el) => el.getBoundingClientRect().width))
      .toBeLessThan(100)

    const logoBox = (await logo.boundingBox())!
    const navBox = (await sidebarNav(page).boundingBox())!
    const sidebarBox = (await sidebar(page).boundingBox())!
    expect(logoBox.y).toBeLessThan(navBox.y)
    expect(
      Math.abs(logoBox.x + logoBox.width / 2 - (sidebarBox.x + sidebarBox.width / 2)),
    ).toBeLessThan(2)
  })

  test('colapsar convierte las etiquetas en iconos y actualiza el botón', async ({
    page,
    tracker,
  }) => {
    await tracker.goto()
    const dashboardItem = sidebarNav(page).getByRole('button', { name: 'Dashboard' })
    const label = dashboardItem.getByText('Dashboard')
    await expect(label).toHaveCSS('opacity', '1')

    await toggle(page).click()

    await expect(html(page)).toHaveAttribute('data-sidebar', 'collapsed')
    await expect(label).toHaveCSS('opacity', '0')
    await expect(toggle(page)).toHaveAttribute('aria-label', 'Expandir barra lateral')
    await expect(toggle(page)).toHaveAttribute('aria-expanded', 'false')
  })

  test('el sidebar colapsado reduce su anchura visiblemente respecto al expandido', async ({
    page,
    tracker,
  }) => {
    await tracker.goto()
    const width = () => sidebar(page).evaluate((el) => el.getBoundingClientRect().width)
    const expandedWidth = await width()

    await toggle(page).click()
    await expect.poll(width).toBeLessThan(100)

    expect(await width()).toBeLessThan(expandedWidth)
  })

  test('se puede navegar a una sección haciendo click en el icono cuando el sidebar está colapsado', async ({
    page,
    tracker,
  }) => {
    await tracker.goto()

    await toggle(page).click()
    await expect(html(page)).toHaveAttribute('data-sidebar', 'collapsed')

    await sidebarNav(page).getByRole('button', { name: 'Movimientos' }).click()
    await expect(page.locator('#transactions')).toBeVisible()
    await expect(page.getByRole('heading', { name: 'Movimientos', exact: true })).toBeVisible()

    await sidebarNav(page).getByRole('button', { name: 'Inversión' }).click()
    await expect(page.locator('#investment')).toBeVisible()
  })

  test('expandir de nuevo el sidebar vuelve a mostrar las etiquetas de texto', async ({
    page,
    tracker,
  }) => {
    await tracker.goto()
    const label = sidebarNav(page).getByRole('button', { name: 'Dashboard' }).getByText('Dashboard')

    await toggle(page).click()
    await expect(html(page)).toHaveAttribute('data-sidebar', 'collapsed')

    await toggle(page).click()
    await expect(html(page)).toHaveAttribute('data-sidebar', 'expanded')

    await expect(label).toHaveCSS('opacity', '1')
    await expect(toggle(page)).toHaveAttribute('aria-label', 'Colapsar barra lateral')
  })

  test('el estado colapsado persiste tras recargar la página (localStorage)', async ({
    page,
    tracker,
  }) => {
    await tracker.goto()

    await toggle(page).click()
    await expect(html(page)).toHaveAttribute('data-sidebar', 'collapsed')

    await tracker.reload()
    await expect(page.locator('#dashboard')).toBeVisible()

    await expect(html(page)).toHaveAttribute('data-sidebar', 'collapsed')
    await expect(toggle(page)).toHaveAttribute('aria-expanded', 'false')
  })

  test('el estado expandido persiste tras recargar la página', async ({ page, tracker }) => {
    await tracker.goto()

    await toggle(page).click()
    await toggle(page).click()
    await expect(html(page)).toHaveAttribute('data-sidebar', 'expanded')

    await tracker.reload()
    await expect(page.locator('#dashboard')).toBeVisible()

    await expect(html(page)).toHaveAttribute('data-sidebar', 'expanded')
  })

  test('las 8 secciones siguen en el nav tanto expandido como colapsado', async ({
    page,
    tracker,
  }) => {
    await tracker.goto()
    const items = sidebarNav(page).getByRole('button')
    await expect(items).toHaveCount(8)

    await toggle(page).click()

    await expect(items).toHaveCount(8)
    await expect(items.first()).toBeVisible()
  })
})

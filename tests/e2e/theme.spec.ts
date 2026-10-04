import type { Locator, Page } from '@playwright/test'
import { test, expect } from './fixtures'

const html = (page: Page) => page.locator('html')
const sidebarTheme = (page: Page) =>
  page.getByRole('complementary').getByRole('group', { name: 'Tema' })
const settingsTheme = (page: Page) => page.locator('#settings').getByRole('group', { name: 'Tema' })

async function expectPressed(group: Locator, name: string | RegExp) {
  await expect(group.getByRole('button', { name, exact: true })).toHaveAttribute(
    'aria-pressed',
    'true',
  )
}

test.describe('Tema: claro, oscuro o sistema', () => {
  test('por defecto sigue al sistema y cambia en vivo con él', async ({ page, tracker }) => {
    await page.emulateMedia({ colorScheme: 'light' })
    await tracker.goto()

    await expectPressed(sidebarTheme(page), 'Tema del sistema')
    await expect(html(page)).toHaveAttribute('data-theme', 'light')

    await page.emulateMedia({ colorScheme: 'dark' })
    await expect(html(page)).toHaveAttribute('data-theme', 'dark')

    await page.emulateMedia({ colorScheme: 'light' })
    await expect(html(page)).toHaveAttribute('data-theme', 'light')
  })

  test('la elección de la barra lateral se aplica, se recuerda y deja de seguir al sistema', async ({
    page,
    tracker,
  }) => {
    await page.emulateMedia({ colorScheme: 'light' })
    await tracker.goto()

    await sidebarTheme(page).getByRole('button', { name: 'Tema oscuro' }).click()
    await expect(html(page)).toHaveAttribute('data-theme', 'dark')
    await expectPressed(sidebarTheme(page), 'Tema oscuro')

    await tracker.reload()
    await expect(html(page)).toHaveAttribute('data-theme', 'dark')
    await expectPressed(sidebarTheme(page), 'Tema oscuro')

    await page.emulateMedia({ colorScheme: 'dark' })
    await page.emulateMedia({ colorScheme: 'light' })
    await expect(html(page)).toHaveAttribute('data-theme', 'dark')
  })

  test('Configuración › Preferencias elige el tema y comparte estado con la barra lateral', async ({
    page,
    tracker,
  }) => {
    await page.emulateMedia({ colorScheme: 'dark' })
    await tracker.goto()
    await tracker.openSettingsTab('Preferencias')
    const summary = page.locator('#settings [data-theme-summary]')

    await expectPressed(settingsTheme(page), 'Sistema')
    await expect(summary).toHaveText('Sigue al sistema: ahora oscuro.')

    await settingsTheme(page).getByRole('button', { name: 'Claro', exact: true }).click()
    await expect(html(page)).toHaveAttribute('data-theme', 'light')
    await expect(summary).toHaveText('Siempre claro.')
    await expectPressed(sidebarTheme(page), 'Tema claro')

    await sidebarTheme(page).getByRole('button', { name: 'Tema del sistema' }).click()
    await expect(html(page)).toHaveAttribute('data-theme', 'dark')
    await expectPressed(settingsTheme(page), 'Sistema')

    await tracker.reload()
    await expect(html(page)).toHaveAttribute('data-theme', 'dark')
    await expectPressed(sidebarTheme(page), 'Tema del sistema')
  })

  test.describe('móvil', () => {
    test.use({ viewport: { width: 393, height: 851 }, isMobile: true, hasTouch: true })

    test('la hoja «Más» y la barra superior eligen el mismo tema', async ({ page, tracker }) => {
      await page.emulateMedia({ colorScheme: 'light' })
      await tracker.goto()
      const appBarTheme = page.locator('[data-mobile-app-bar]').getByRole('group', { name: 'Tema' })

      await page.getByRole('button', { name: 'Más secciones' }).click()
      const sheetTheme = page
        .getByRole('dialog', { name: 'Más secciones' })
        .getByRole('group', { name: 'Tema' })
      await expectPressed(sheetTheme, 'Sistema')

      await sheetTheme.getByRole('button', { name: 'Oscuro', exact: true }).click()
      await expect(html(page)).toHaveAttribute('data-theme', 'dark')
      await expectPressed(appBarTheme, 'Tema oscuro')

      await page.getByRole('button', { name: 'Cerrar menú' }).click()
      await appBarTheme.getByRole('button', { name: 'Tema claro' }).click()
      await expect(html(page)).toHaveAttribute('data-theme', 'light')
    })
  })
})

import type { Page } from '@playwright/test'
import { test, expect } from './fixtures'

/**
 * Los cuatro temas del diseño nuevo (#445), en escritorio. Sin cookie: el
 * diseño nuevo es el de por defecto. Los valores de cada tema y su contraste
 * son del guard de styles-guards.test.ts; aquí, qué elige la persona y qué
 * conserva al recargar.
 */
const NO_COOKIE = { cookies: [], origins: [] }

test.use({ storageState: NO_COOKIE })

const html = (page: Page) => page.locator('html')
const picker = (page: Page) => page.locator('#settings').getByRole('group', { name: 'Tema' })
const canvas = (page: Page) => page.evaluate(() => getComputedStyle(document.body).backgroundColor)

const THEMES = [
  { id: 'oscuro-suave', label: 'Oscuro suave', canvas: 'rgb(27, 26, 24)' }, // #1B1A18
  { id: 'oscuro-fuerte', label: 'Oscuro fuerte', canvas: 'rgb(18, 17, 16)' }, // #121110
  { id: 'claro-hueso', label: 'Claro hueso', canvas: 'rgb(241, 238, 232)' }, // #F1EEE8
  { id: 'claro-melocoton', label: 'Claro melocotón', canvas: 'rgb(247, 235, 226)' }, // #F7EBE2
]

test.describe('Temas del diseño nuevo', () => {
  test('sin preferencia usa oscuro suave, o claro melocotón si el sistema pide claro', async ({
    page,
    tracker,
  }) => {
    await page.emulateMedia({ colorScheme: 'dark' })
    await tracker.goto()
    await expect(html(page)).toHaveAttribute('data-theme', 'oscuro-suave')

    await page.emulateMedia({ colorScheme: 'light' })
    await expect(html(page)).toHaveAttribute('data-theme', 'claro-melocoton')
    await tracker.reload()
    await expect(html(page)).toHaveAttribute('data-theme', 'claro-melocoton')
  })

  test('el marco nuevo no tiene el selector sol/pantalla/luna de la cabecera', async ({
    page,
    tracker,
  }) => {
    await tracker.goto()

    await expect(page.getByRole('group', { name: 'Tema' })).toHaveCount(0)
    await expect(page.getByRole('button', { name: 'Tema oscuro' })).toHaveCount(0)
  })

  test('elige cada tema en Configuración, se aplica al momento y se conserva al recargar', async ({
    page,
    tracker,
  }) => {
    await page.emulateMedia({ colorScheme: 'dark' })
    await tracker.openSettings()
    await expect(picker(page).getByRole('button', { pressed: true })).toHaveText('Oscuro suave')

    for (const theme of THEMES) {
      await picker(page).getByRole('button', { name: theme.label, exact: true }).click()
      await expect(html(page)).toHaveAttribute('data-theme', theme.id)
      await expect.poll(() => canvas(page)).toBe(theme.canvas)

      // The first paint already carries it: with the app's scripts blocked,
      // only the inline script before the paint can set the theme.
      await page.route('**/_astro/**', (route) => route.abort())
      await page.goto('/')
      expect(await html(page).getAttribute('data-theme')).toBe(theme.id)
      await page.unroute('**/_astro/**')

      await tracker.reload()
      await tracker.openSettings()
      await expect(picker(page).getByRole('button', { pressed: true })).toHaveText(theme.label)
    }
  })

  test('una elección deja de seguir al sistema', async ({ page, tracker }) => {
    await page.emulateMedia({ colorScheme: 'light' })
    await tracker.openSettings()

    await picker(page).getByRole('button', { name: 'Oscuro fuerte', exact: true }).click()
    await page.emulateMedia({ colorScheme: 'dark' })
    await page.emulateMedia({ colorScheme: 'light' })

    await expect(html(page)).toHaveAttribute('data-theme', 'oscuro-fuerte')
  })
})

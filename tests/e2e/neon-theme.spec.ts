import type { Page } from '@playwright/test'
import { test, expect } from './fixtures'

/**
 * Los cuatro temas (#445), en escritorio. Los valores de cada tema y su contraste
 * son del guard de styles-guards.test.ts; aquí, qué elige la persona y qué
 * conserva al recargar.
 */
const html = (page: Page) => page.locator('html')
const picker = (page: Page) => page.locator('#settings').getByRole('group', { name: 'Tema' })

const THEMES = [
  { id: 'oscuro-suave', label: 'Oscuro suave' },
  { id: 'oscuro-fuerte', label: 'Oscuro fuerte' },
  { id: 'claro-hueso', label: 'Claro hueso' },
  { id: 'claro-melocoton', label: 'Claro melocotón' },
]

test.describe('Temas', () => {
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

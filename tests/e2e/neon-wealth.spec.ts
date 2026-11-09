import type { Page } from '@playwright/test'
import { test, expect } from './fixtures'
import { expectSyncCommand } from './pages/sync'

/**
 * Patrimonio in the new design (#435), desktop. No cookie: the new design is
 * the default. The clock sits on 20 March 2026: the seed closes January and
 * February, and March is still open.
 */
const NO_COOKIE = { cookies: [], origins: [] }

test.use({ storageState: NO_COOKIE, fixedTime: '2026-03-20T12:00:00Z' })

const section = (page: Page) => page.locator('#wealth')
const net = (page: Page) => section(page).locator('[data-wealth-net]')
const status = (page: Page) => section(page).locator('[data-wealth-status]')

/** «−1.234,56 €» → -1234.56. */
function money(text: string): number {
  const clean = text
    .replace(/[^\d,−-]/g, '')
    .replace('−', '-')
    .replace(',', '.')
  return Number(clean)
}

test.describe('Patrimonio en el diseño nuevo', () => {
  test('abre el detalle de una cuenta, lee otro mes y vuelve', async ({ page, tracker }) => {
    await tracker.openWealth()
    await expect(section(page).getByRole('heading', { name: 'Patrimonio', level: 1 })).toBeVisible()

    await section(page)
      .getByRole('button', { name: /^Revolut: / })
      .click()
    const detail = page.getByRole('dialog', { name: 'Revolut' })
    await expect(detail).toBeVisible()
    await expect(detail.getByText('desde febrero', { exact: true })).toBeVisible()

    const months = detail.getByRole('group', { name: 'Saldo de Revolut mes a mes' })
    await months.getByRole('button', { name: /^Febrero: / }).click()
    await expect(detail.locator('[data-account-value]')).toHaveText('1.299,11 €')
    await expect(detail.getByText('desde enero', { exact: true })).toBeVisible()

    await detail.getByRole('button', { name: 'Cerrar' }).click()
    await expect(detail).toBeHidden()
    await expect(section(page).getByRole('button', { name: /^Revolut: / })).toBeFocused()
  })

  test(
    'cierra marzo con un saldo apuntado y ve el patrimonio actualizado',
    { tag: '@smoke' },
    async ({ page, tracker }) => {
      await tracker.openWealth()
      await expect(status(page)).toHaveText('Marzo sin cerrar')
      const before = money(await net(page).innerText())

      await section(page).getByRole('button', { name: 'Cerrar marzo' }).click()
      await expect(
        section(page).getByRole('heading', { name: 'Balance por meses', level: 1 }),
      ).toBeVisible()

      const field = section(page).getByRole('textbox', { name: 'Saldo de Revolut en marzo' })
      const calculated = money((await field.getAttribute('placeholder')) ?? '')
      await field.fill('5000')
      const expected = before + (5000 - calculated)
      await expect.poll(async () => money(await net(page).innerText())).toBeCloseTo(expected, 2)
      await expect(section(page).locator('[data-close-status]')).toHaveText(
        '1 saldo editado, sin cerrar',
      )

      const saved = expectSyncCommand(
        page,
        (command) => 'entityType' in command && command.entityType === 'wealthSnapshot',
      )
      await section(page).getByRole('button', { name: 'Cerrar marzo' }).click()
      await saved
      await expect(page.getByRole('status').filter({ hasText: 'Marzo cerrado.' })).toBeVisible()
      await expect(status(page)).toHaveText('Marzo cerrado')
      await expect(section(page).getByRole('button', { name: 'Marzo, cerrado' })).toBeVisible()

      await section(page).getByRole('button', { name: 'Patrimonio', exact: true }).click()
      await expect(status(page)).toHaveText('Marzo cerrado')
      await expect.poll(async () => money(await net(page).innerText())).toBeCloseTo(expected, 2)

      await tracker.reload()
      await tracker.openWealth()
      await expect.poll(async () => money(await net(page).innerText())).toBeCloseTo(expected, 2)
      await section(page)
        .getByRole('button', { name: /^Revolut: / })
        .click()
      await expect(
        page.getByRole('dialog', { name: 'Revolut' }).locator('[data-account-value]'),
      ).toHaveText('5.000,00 €')
    },
  )
})

import type { Page } from '@playwright/test'
import { test, expect } from './fixtures'
import { expectSyncCommand } from './pages/sync'

/**
 * Patrimonio (#435), desktop. The clock sits on 20 March 2026: the seed closes January and
 * February, and March is still open.
 */
test.use({ fixedTime: '2026-03-20T12:00:00Z' })

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

test.describe('Patrimonio', () => {
  test('consulta la evolución, fija un mes en la gráfica y cambia el rango', async ({
    page,
    tracker,
  }) => {
    await page.emulateMedia({ reducedMotion: 'reduce' })
    await tracker.openWealth()
    const evolution = section(page).getByRole('region', { name: 'Evolución del patrimonio' })
    const line = evolution.getByRole('slider', { name: /^Patrimonio por mes/ })
    await expect(line).toHaveAttribute('aria-valuetext', /Marzo: .*saldo sin cerrar/)
    await expect(line.locator('path[stroke-dasharray]')).toHaveCount(1)

    await line.press('Home')
    await expect(line).toHaveAttribute('aria-valuetext', /^Enero:/)
    await expect(evolution.locator('[data-wealth-month-change]')).toHaveText('—')
    await line.press('Enter')
    await line.press('Escape')
    await expect(line).toHaveAttribute('aria-valuetext', /^Enero:/)
    await expect(evolution.getByText('En enero', { exact: true })).toBeVisible()
    await expect(evolution.getByText('Desde enero', { exact: true })).toBeVisible()

    // The range is in the title: a tab of presets, with the year so far chosen.
    const trigger = evolution.locator('[data-wealth-range]')
    await expect(trigger).toHaveText('2026')
    await trigger.click()
    const ranges = page.getByRole('dialog', { name: 'Rango de la gráfica' })
    await expect(ranges.getByRole('button', { name: 'En lo que va de año' })).toHaveAttribute(
      'aria-pressed',
      'true',
    )
    // It stays open on a pick, to compare ranges one after another.
    await ranges.getByRole('button', { name: 'Últimos 3 meses' }).click()
    await expect(ranges).toBeVisible()
    await expect(trigger).toHaveText('3 meses')
    await expect(evolution.getByText('En 3 meses', { exact: true })).toBeVisible()
    await expect(ranges.getByRole('button', { name: 'Últimos 3 meses' })).toHaveAttribute(
      'aria-pressed',
      'true',
    )

    await page.keyboard.press('Escape')
    await expect(page.getByRole('dialog', { name: 'Rango de la gráfica' })).toBeHidden()
    await expect(trigger).toBeFocused()
  })

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

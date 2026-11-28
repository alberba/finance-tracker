import type { Page } from '@playwright/test'
import { test, expect } from './fixtures'

/** Datos in the mobile frame (#447): every control is reachable with a finger. */
const section = (page: Page) => page.locator('#data')

test('todos los controles miden al menos 44 px con puntero táctil', async ({ page, tracker }) => {
  expect(await page.evaluate(() => matchMedia('(pointer: coarse)').matches)).toBe(true)

  const tooSmall = () =>
    page.locator('#data :is(button, a[href], input, select)').evaluateAll((controls) =>
      controls
        .filter((control) => control.getClientRects().length > 0)
        .map((control) => {
          const { width, height } = control.getBoundingClientRect()
          const name = control.getAttribute('aria-label') || control.textContent?.trim()
          return { name, width: Math.round(width), height: Math.round(height) }
        })
        .filter(({ width, height }) => width < 44 || height < 44),
    )

  await tracker.goto()
  await tracker.openData()
  expect(await tooSmall()).toEqual([])

  await section(page).locator('[data-import-toggle]').click()
  await expect(section(page).locator('[data-import-flow]')).toBeVisible()
  expect(await tooSmall()).toEqual([])

  await section(page).locator('[data-origin="json"]').click()
  await section(page)
    .locator('#import-json')
    .setInputFiles({
      name: 'copia.json',
      mimeType: 'application/json',
      buffer: Buffer.from('{}'),
    })
  await expect(section(page).getByRole('button', { name: 'Sustituir mis datos' })).toBeVisible()
  expect(await tooSmall()).toEqual([])

  await section(page).getByRole('button', { name: 'Empezar de cero' }).click()
  await expect(section(page).getByRole('alertdialog')).toBeVisible()
  expect(await tooSmall()).toEqual([])
})

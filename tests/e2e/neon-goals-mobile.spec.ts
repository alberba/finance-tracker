import type { Page } from '@playwright/test'
import { test, expect } from './fixtures'
import { expectSyncCommand } from './pages/sync'

/**
 * Objetivos in the mobile frame (#442), in the mobile
 * project. The clock sits on 20
 * March 2026; the seed has no savings goals. Figures are the view-model's unit
 * tests'; here, what the user does and what they get.
 */
test.use({ fixedTime: '2026-03-20T12:00:00Z' })

const section = (page: Page) => page.locator('#goals')
const goalPanel = (page: Page) => page.getByRole('dialog', { name: 'Nuevo objetivo' })

test.beforeEach(async ({ tracker }) => {
  await tracker.openGoals()
})

/** Creates a goal from the «Nuevo objetivo» sheet and waits for it to sync. */
async function createGoal(page: Page, name: string, amount: string, when: string): Promise<void> {
  await section(page).getByRole('button', { name: 'Nuevo objetivo' }).click()
  const panel = goalPanel(page)
  await expect(panel).toBeVisible()
  await panel.getByLabel('Nombre').fill(name)
  await panel.getByLabel('Cuánto necesitas').fill(amount)
  await panel.getByRole('button', { name: when }).click()
  const created = expectSyncCommand(
    page,
    (command) =>
      command.action === 'create' && command.entityType === 'goal' && command.data.name === name,
  )
  await panel.getByRole('button', { name: 'Crear objetivo' }).click()
  await expect(panel).toBeHidden()
  await created
}

test('reparte el ahorro entre los objetivos desde la hoja', async ({ page }) => {
  await createGoal(page, 'Colchón', '1.000', '1 año')

  await section(page).getByRole('button', { name: 'Repartir el ahorro' }).click()
  const panel = page.getByRole('dialog', { name: 'Repartir el ahorro' })
  await expect(panel).toBeVisible()
  const share = panel.getByRole('textbox', { name: 'Al mes para Colchón' })
  const before = Number((await share.inputValue()).replace(/\D/g, ''))
  await panel.getByRole('button', { name: 'Sumar 10 € a Colchón' }).click()
  await expect(share).toHaveValue(String(before + 10))

  const saved = expectSyncCommand(
    page,
    (command) => command.action === 'update' && command.entityType === 'goal',
  )
  await panel.getByRole('button', { name: 'Guardar reparto' }).click()
  await expect(panel).toBeHidden()
  await saved
})

test('todos los controles miden al menos 44 px con puntero táctil', async ({ page }) => {
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

  const CONTROLS = 'button, a[href], input, select'
  await createGoal(page, 'Colchón', '1.000', '1 año')
  expect(await tooSmall(`#goals :is(${CONTROLS})`)).toEqual([])

  await section(page).getByRole('button', { name: 'Nuevo objetivo' }).click()
  await expect(goalPanel(page)).toBeVisible()
  expect(await tooSmall(`dialog[open] :is(${CONTROLS})`)).toEqual([])
  await page.keyboard.press('Escape')
  await expect(goalPanel(page)).toBeHidden()

  await section(page).getByRole('button', { name: 'Repartir el ahorro' }).click()
  await expect(page.getByRole('dialog', { name: 'Repartir el ahorro' })).toBeVisible()
  expect(await tooSmall(`dialog[open] :is(${CONTROLS})`)).toEqual([])
})

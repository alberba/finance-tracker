import type { Page } from '@playwright/test'
import { test, expect } from './fixtures'
import { expectSyncCommand } from './pages/sync'

/**
 * Objetivos in the new design (#441), desktop. No cookie: the new design is
 * the default. The clock sits on 20 March 2026; the seed has no savings goals.
 */
const NO_COOKIE = { cookies: [], origins: [] }

test.use({ storageState: NO_COOKIE, fixedTime: '2026-03-20T12:00:00Z' })

const section = (page: Page) => page.locator('#goals')
const column = (page: Page, name: string) => section(page).locator(`[data-goal-column="${name}"]`)
const goalPanel = (page: Page) => page.getByRole('dialog', { name: 'Nuevo objetivo' })

/** Creates a goal from «Nuevo objetivo» with a category of its own, and waits for it to sync. */
async function createGoal(page: Page, name: string, amount: string, when: string): Promise<void> {
  await section(page).getByRole('button', { name: 'Nuevo objetivo' }).click()
  const panel = goalPanel(page)
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

test.describe('Objetivos en el diseño nuevo', () => {
  test('crea un objetivo y ve su progreso', { tag: '@smoke' }, async ({ page, tracker }) => {
    await tracker.openGoals()
    await expect(section(page).getByRole('heading', { name: 'Objetivos', level: 1 })).toBeVisible()
    await expect(section(page).locator('[data-empty-state]')).toBeVisible()

    await section(page).getByRole('button', { name: 'Nuevo objetivo' }).click()
    const panel = goalPanel(page)
    await panel.getByLabel('Nombre').fill('Viaje a Islandia')
    await panel.getByLabel('Cuánto necesitas').fill('3.600')
    await panel.getByRole('button', { name: '18 meses' }).click()
    // 3.600 € over 18 months.
    await expect(panel.getByText(/Apartar\s+200\s€\sal mes/)).toBeVisible()
    await panel.getByRole('button', { name: 'Cancelar' }).click()
    await expect(panel).toBeHidden()

    await createGoal(page, 'Viaje a Islandia', '3.600', '18 meses')
    const islandia = column(page, 'Viaje a Islandia')
    await expect(islandia.locator('[data-goal-percent]')).toHaveText('0 %')
    // 200 € a month from March 2026 arrives in September 2027, its deadline.
    await expect(islandia).toContainText('sep 2027')
    await expect(islandia.locator('[data-goal-verdict]')).toHaveText('Justo a tiempo')

    await tracker.reload()
    await tracker.openGoals()
    await expect(column(page, 'Viaje a Islandia').locator('[data-goal-verdict]')).toHaveText(
      'Justo a tiempo',
    )
    await expect(
      section(page).getByRole('region', { name: 'Objetivo seleccionado' }),
    ).toContainText('Viaje a Islandia')
  })

  test('aporta a un objetivo y ve el progreso al recargar', async ({ page, tracker }) => {
    await tracker.openGoals()
    await createGoal(page, 'Colchón', '1.000', '1 año')
    await expect(column(page, 'Colchón').locator('[data-goal-percent]')).toHaveText('0 %')

    // A saving in the goal's category is what it adds up.
    await page.locator('[data-sidebar-apuntar]').click()
    const sheet = page.getByRole('dialog', { name: 'Apuntar' })
    await sheet.getByRole('radio', { name: 'Ahorro' }).click()
    await sheet.getByRole('textbox', { name: 'Importe' }).fill('250')
    await sheet.getByLabel('Categoría').selectOption('Colchón')
    await sheet.getByLabel('Descripción').fill('e2e-aportacion')
    const saved = expectSyncCommand(
      page,
      (command) =>
        command.action === 'create' &&
        command.entityType === 'transaction' &&
        command.data.description === 'e2e-aportacion',
    )
    await sheet.getByRole('button', { name: 'Guardar' }).click()
    await expect(sheet).toBeHidden()
    await saved

    await expect(column(page, 'Colchón').locator('[data-goal-percent]')).toHaveText('25 %')
    await tracker.reload()
    await tracker.openGoals()
    await expect(column(page, 'Colchón').locator('[data-goal-percent]')).toHaveText('25 %')
  })
})

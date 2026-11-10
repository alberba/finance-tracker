import type { Page } from '@playwright/test'
import type { Month } from '../../src/lib/month'
import { test, expect } from './fixtures'
import type { FinanceTrackerPage } from './pages/FinanceTrackerPage'
import { expectSyncCommand } from './pages/sync'
import { editScenarioState } from './seed-sync-v2'

/**
 * Presupuesto in the new design (#433), desktop. No cookie: the new design is
 * the default. The clock sits on 20 March 2026, the newest month of the seed.
 */
const NO_COOKIE = { cookies: [], origins: [] }

test.use({ storageState: NO_COOKIE, fixedTime: '2026-03-20T12:00:00Z' })

const section = (page: Page) => page.locator('#budget')
const card = (page: Page, category: string) =>
  section(page).locator(`[data-budget-category="${category}"]`)
const sheet = (page: Page) => page.getByRole('dialog', { name: 'Apuntar' })

/** Leaves one category with no budget and a single March expense. */
async function resetCategory(
  page: Page,
  tracker: FinanceTrackerPage,
  category: string,
  { plan = 0, spent = 0 }: { plan?: number; spent?: number },
): Promise<void> {
  await tracker.goto()
  await editScenarioState(page, (state) => {
    state.budget.expense[category] = Array<number>(12).fill(plan)
    state.transactions = state.transactions.filter(
      (tx) => !(tx.type === 'expense' && tx.category === category),
    )
    if (spent) {
      state.transactions.push({
        id: `e2e-${category}`,
        date: '2026-03-05',
        month: 3 as Month,
        type: 'expense',
        accountId: state.accounts[0].id,
        category,
        description: `e2e ${category}`,
        amount: spent,
      })
    }
  })
  await tracker.openBudget()
}

test.describe('Presupuesto en el diseño nuevo', () => {
  test(
    'fija el límite de una categoría y ve su progreso y lo que queda',
    { tag: '@smoke' },
    async ({ page, tracker }) => {
      await resetCategory(page, tracker, 'Salud', { spent: 30 })
      await expect(card(page, 'Salud')).toHaveCount(0)
      await expect(section(page).getByText('Sin presupuesto este mes: Salud')).toBeVisible()

      await section(page).getByRole('button', { name: 'Ver el año' }).click()
      await expect(section(page).getByRole('heading', { name: 'El año', level: 1 })).toBeVisible()
      await setLimit(page, 'Salud', 'marzo', '120')

      await section(page)
        .getByRole('button', { name: /Este mes/ })
        .click()
      await expect(card(page, 'Salud').locator('[data-budget-left]')).toHaveText('90,00 €')
      await expect(card(page, 'Salud').locator('[data-budget-status]')).toHaveText('Holgado')

      await tracker.reload()
      await tracker.openBudget()
      await expect(card(page, 'Salud').locator('[data-budget-left]')).toHaveText('90,00 €')

      await card(page, 'Salud').click()
      const detail = page.getByRole('dialog', { name: 'Salud' })
      await expect(detail.getByText('Marzo')).toBeVisible()
      await expect(detail.getByText('quedan 90,00 €')).toBeVisible()
    },
  )

  test('ve una categoría pasada de límite tras apuntar un gasto', async ({ page, tracker }) => {
    await resetCategory(page, tracker, 'Regalo', { plan: 20 })
    await expect(card(page, 'Regalo').locator('[data-budget-left]')).toHaveText('20,00 €')

    await page.locator('[data-sidebar-apuntar]').click()
    await expect(sheet(page)).toBeVisible()
    await sheet(page).getByRole('textbox', { name: 'Importe' }).fill('25')
    await sheet(page).getByLabel('Categoría').selectOption('Regalo')
    await sheet(page).getByLabel('Descripción').fill('Regalo de cumpleaños')
    const saved = expectSyncCommand(
      page,
      (command) =>
        'entityType' in command &&
        command.entityType === 'transaction' &&
        command.action === 'create',
    )
    await sheet(page).getByRole('button', { name: 'Guardar' }).click()
    await saved

    await expect(card(page, 'Regalo').locator('[data-budget-status]')).toHaveText('Pasado')
    await expect(card(page, 'Regalo').locator('[data-budget-left]')).toHaveText('5,00 €')
    await expect(card(page, 'Regalo')).toContainText('por encima de 20,00 €')
  })

  test('planifica los doce meses de una categoría desde su panel', async ({ page, tracker }) => {
    await tracker.openBudget()
    await section(page).getByRole('button', { name: 'Ver el año' }).click()
    await section(page).getByRole('button', { name: 'Plan de Ocio para el año' }).click()

    const panel = page.getByRole('dialog', { name: 'Ocio' })
    await expect(panel.getByText('Plan de 2026 · Gastos')).toBeVisible()
    await panel.getByRole('textbox', { name: 'Presupuesto de Ocio en diciembre' }).fill('250')
    await panel.getByRole('textbox', { name: 'Presupuesto de Ocio en noviembre' }).fill('abc')
    await expect(panel.getByRole('button', { name: 'Guardar plan' })).toBeDisabled()
    await panel.getByRole('textbox', { name: 'Presupuesto de Ocio en noviembre' }).fill('140,5')
    const saved = expectSyncCommand(
      page,
      (command) => 'entityType' in command && command.entityType === 'budgetEntry',
      2,
    )
    await panel.getByRole('button', { name: 'Guardar plan' }).click()
    await saved
    await expect(panel).toBeHidden()

    await tracker.reload()
    await tracker.openBudget()
    await section(page).getByRole('button', { name: 'Ver el año' }).click()
    await expect(
      section(page).getByRole('button', { name: 'Presupuesto de Ocio en diciembre', exact: true }),
    ).toContainText('250')
  })
})

async function setLimit(page: Page, category: string, month: string, value: string) {
  const saved = expectSyncCommand(
    page,
    (command) => 'entityType' in command && command.entityType === 'budgetEntry',
  )
  const name = `Presupuesto de ${category} en ${month}`
  await section(page).getByRole('button', { name, exact: true }).click()
  const input = section(page).getByRole('textbox', { name, exact: true })
  await input.fill(value)
  await input.press('Enter')
  await saved
}

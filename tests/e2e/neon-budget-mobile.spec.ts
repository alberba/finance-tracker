import type { Page } from '@playwright/test'
import type { Month } from '../../src/lib/month'
import { test, expect } from './fixtures'
import { expectSyncCommand } from './pages/sync'
import { editScenarioState } from './seed-sync-v2'

/**
 * Presupuesto del diseño nuevo en el marco móvil (#434), en el proyecto móvil.
 * Sin cookie: el diseño nuevo es el de por defecto. El reloj está en el 20 de
 * marzo de 2026, el mes más reciente de la semilla. Las cifras las prueba el
 * unit del view-model; aquí, lo que hace el usuario y lo que obtiene.
 */
const NO_COOKIE = { cookies: [], origins: [] }

test.use({ storageState: NO_COOKIE, fixedTime: '2026-03-20T12:00:00Z' })

const section = (page: Page) => page.locator('#budget')
const card = (page: Page, category: string) =>
  section(page).locator(`[data-budget-category="${category}"]`)

/** Leaves «Salud» with no budget and a single March expense, and opens Presupuesto. */
async function withoutLimit(
  page: Page,
  tracker: { goto(): Promise<void>; openBudget(): Promise<void> },
) {
  await tracker.goto()
  await editScenarioState(page, (state) => {
    state.budget.expense['Salud'] = Array<number>(12).fill(0)
    state.transactions = state.transactions.filter(
      (tx) => !(tx.type === 'expense' && tx.category === 'Salud'),
    )
    state.transactions.push({
      id: 'e2e-salud',
      date: '2026-03-05',
      month: 3 as Month,
      type: 'expense',
      accountId: state.accounts[0].id,
      category: 'Salud',
      description: 'e2e Salud',
      amount: 30,
    })
  })
  await tracker.openBudget()
}

test('fija el límite de una categoría desde el móvil y ve lo que queda', async ({
  page,
  tracker,
}) => {
  await withoutLimit(page, tracker)
  await expect(card(page, 'Salud')).toHaveCount(0)
  await expect(section(page).getByText('Sin presupuesto este mes: Salud')).toBeVisible()

  await section(page).getByRole('button', { name: 'Ver el año' }).click()
  await expect(section(page).getByRole('heading', { name: 'El año', level: 1 })).toBeVisible()
  await section(page)
    .getByRole('group', { name: 'Vista' })
    .getByRole('button', { name: 'Mes', exact: true })
    .click()

  const name = 'Presupuesto de Salud en marzo'
  await section(page).getByRole('button', { name, exact: true }).click()
  const saved = expectSyncCommand(
    page,
    (command) => 'entityType' in command && command.entityType === 'budgetEntry',
  )
  const field = section(page).getByRole('textbox', { name, exact: true })
  await field.fill('120')
  await field.press('Enter')
  await saved

  await section(page)
    .getByRole('button', { name: /Este mes/ })
    .click()
  await expect(card(page, 'Salud').locator('[data-budget-left]')).toHaveText('90,00 €')
  await expect(card(page, 'Salud').locator('[data-budget-status]')).toHaveText('Holgado')

  await card(page, 'Salud').click()
  const detail = page.getByRole('dialog', { name: 'Salud' })
  await expect(detail.getByText('quedan 90,00 €')).toBeVisible()
})

test('planifica los doce meses de una categoría desde su hoja inferior', async ({
  page,
  tracker,
}) => {
  await tracker.goto()
  await tracker.openBudget()
  await section(page).getByRole('button', { name: 'Ver el año' }).click()
  await section(page).getByRole('button', { name: 'Plan de Ocio para el año' }).first().click()

  const sheet = page.getByRole('dialog', { name: 'Ocio' })
  await expect(sheet.getByText('Plan de 2026 · Gastos')).toBeVisible()
  const saved = expectSyncCommand(
    page,
    (command) => 'entityType' in command && command.entityType === 'budgetEntry',
  )
  await sheet.getByRole('textbox', { name: 'Presupuesto de Ocio en diciembre' }).fill('250')
  await sheet.getByRole('button', { name: 'Guardar plan' }).click()
  await saved
  await expect(sheet).toBeHidden()
})

test('todos los controles de Presupuesto miden al menos 44 px con puntero táctil', async ({
  page,
  tracker,
}) => {
  await tracker.goto()
  expect(await page.evaluate(() => matchMedia('(pointer: coarse)').matches)).toBe(true)
  await tracker.openBudget()

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
  // A checkbox is as small as its box; the 44 px target is the label around it,
  // which is measured instead.
  const CONTROLS =
    'button, a[href], input:not([type="checkbox"]), label:has(input[type="checkbox"])'
  const inSection = `#budget :is(${CONTROLS})`

  // The cover.
  expect(await tooSmall(inSection)).toEqual([])
  await card(page, 'Ocio').click()
  await expect(page.getByRole('dialog', { name: 'Ocio' })).toBeVisible()
  expect(await tooSmall(`dialog[open] :is(${CONTROLS})`)).toEqual([])
  await page.keyboard.press('Escape')
  await expect(page.getByRole('dialog', { name: 'Ocio' })).toBeHidden()

  // El año, in each of its three views, and its plan sheet.
  await section(page).getByRole('button', { name: 'Ver el año' }).click()
  const views = section(page).getByRole('group', { name: 'Vista' })
  for (const view of ['Año', 'Trimestre', 'Mes']) {
    await views.getByRole('button', { name: view, exact: true }).click()
    expect(await tooSmall(inSection), view).toEqual([])
  }
  await section(page)
    .getByRole('button', { name: 'Presupuesto de Ocio en marzo', exact: true })
    .click()
  expect(await tooSmall(inSection), 'editor').toEqual([])
  await page.keyboard.press('Escape')

  await section(page).getByRole('button', { name: 'Plan de Ocio para el año' }).first().click()
  await expect(page.getByRole('dialog', { name: 'Ocio' })).toBeVisible()
  expect(await tooSmall(`dialog[open] :is(${CONTROLS})`)).toEqual([])
  await page.keyboard.press('Escape')
  await section(page)
    .getByRole('button', { name: /Este mes/ })
    .click()

  // Revisar and Preparar.
  await section(page)
    .getByRole('button', { name: /Revisar febrero/ })
    .click()
  await expect(
    section(page).getByRole('heading', { name: 'Revisar febrero', level: 1 }),
  ).toBeVisible()
  expect(await tooSmall(inSection), 'revisar').toEqual([])
  await section(page).getByRole('button', { name: 'Subir' }).first().click()
  expect(await tooSmall(inSection), 'revisar con importe').toEqual([])
  await section(page)
    .getByRole('button', { name: /Este mes/ })
    .click()
  await section(page)
    .getByRole('button', { name: /Preparar abril/ })
    .click()
  await expect(
    section(page).getByRole('heading', { name: 'Hacer el presupuesto', level: 1 }),
  ).toBeVisible()
  expect(await tooSmall(inSection), 'preparar').toEqual([])
})

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
const closingCard = (page: Page) => section(page).getByRole('region', { name: 'Cierre del mes' })
const budgetEntry = (command: object) =>
  'entityType' in command && command.entityType === 'budgetEntry'

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
  await expect(section(page).getByText('Marzo 2026')).toBeVisible()

  await section(page).getByRole('button', { name: 'Plan de Salud para el año' }).click()
  const sheet = page.getByRole('dialog', { name: 'Salud' })
  await sheet.getByRole('textbox', { name: 'Presupuesto de Salud en marzo' }).fill('120')
  const saved = expectSyncCommand(page, budgetEntry)
  await sheet.getByRole('button', { name: 'Guardar plan' }).click()
  await saved
  await expect(sheet).toBeHidden()

  await section(page)
    .getByRole('button', { name: /Este mes/ })
    .click()
  await expect(card(page, 'Salud').locator('[data-budget-left]')).toHaveText('90,00 €')
  await expect(card(page, 'Salud').locator('[data-budget-status]')).toHaveText('Holgado')

  await card(page, 'Salud').click()
  await expect(
    page.getByRole('dialog', { name: 'Salud' }).getByText('quedan 90,00 €'),
  ).toBeVisible()
})

test('acepta las sugerencias de cierre desde la portada y las deshace', async ({
  page,
  tracker,
}) => {
  await tracker.goto()
  await tracker.openBudget()

  await expect(closingCard(page).getByText('Febrero cerrado')).toBeVisible()
  const saved = expectSyncCommand(page, budgetEntry)
  await closingCard(page).getByRole('button', { name: 'Aceptar' }).click()
  await saved

  await expect(closingCard(page)).toBeHidden()
  const done = section(page).getByRole('status').filter({ hasText: 'Febrero revisado' })
  await expect(done).toBeVisible()
  await done.getByRole('button', { name: /Deshacer/ }).click()
  await expect(closingCard(page)).toBeVisible()
})

test('revisa el mes categoría a categoría y aplica los cambios', async ({ page, tracker }) => {
  await tracker.goto()
  await tracker.openBudget()
  await closingCard(page).getByRole('button', { name: 'Revisar' }).click()
  await expect(
    section(page).getByRole('heading', { name: 'Revisar febrero', level: 1 }),
  ).toBeVisible()

  const apply = section(page).getByRole('button', { name: 'Aplicar' })
  await expect(apply).toBeDisabled()
  await section(page)
    .getByRole('button', { name: /^Aceptar la sugerencia para/ })
    .first()
    .click()
  await expect(section(page).getByRole('status')).toBeVisible()
  await expect(apply).toBeEnabled()
  const saved = expectSyncCommand(page, budgetEntry)
  await apply.click()
  await saved
  await expect(
    section(page).getByRole('status').filter({ hasText: 'Febrero revisado' }),
  ).toBeVisible()
})

test('prepara el mes siguiente desde la hoja de un grupo y lo guarda', async ({
  page,
  tracker,
}) => {
  await tracker.goto()
  await tracker.openBudget()
  await section(page)
    .getByRole('button', { name: /Preparar abril/ })
    .click()
  await expect(
    section(page).getByRole('heading', { name: 'Presupuesto de abril', level: 1 }),
  ).toBeVisible()

  await section(page).locator('[data-prepare-group="expense"]').click()
  const sheet = page.getByRole('dialog', { name: 'Gastos' })
  await sheet
    .getByRole('button', { name: /^Sumar/ })
    .first()
    .click()
  await sheet.getByRole('button', { name: 'Listo' }).click()
  await expect(sheet).toBeHidden()

  const saved = expectSyncCommand(page, budgetEntry)
  await section(page).getByRole('button', { name: 'Guardar' }).click()
  await saved
  await expect(section(page).getByRole('status')).toContainText('Guardado para abril')
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
  const inDialog = `dialog[open] :is(${CONTROLS})`
  const dialog = (name: string) => page.getByRole('dialog', { name })

  // The cover, and the detail sheet of a category.
  expect(await tooSmall(inSection), 'portada').toEqual([])
  await card(page, 'Ocio').click()
  await expect(dialog('Ocio')).toBeVisible()
  expect(await tooSmall(inDialog), 'detalle').toEqual([])
  await page.keyboard.press('Escape')
  await expect(dialog('Ocio')).toBeHidden()

  // El año, and the plan sheet.
  await section(page).getByRole('button', { name: 'Ver el año' }).click()
  expect(await tooSmall(inSection), 'el año').toEqual([])
  await section(page).getByRole('button', { name: 'Plan de Ocio para el año' }).click()
  await expect(dialog('Ocio')).toBeVisible()
  expect(await tooSmall(inDialog), 'plan').toEqual([])
  await page.keyboard.press('Escape')
  await section(page)
    .getByRole('button', { name: /Este mes/ })
    .click()

  // Revisar, with the ones in order unfolded.
  await closingCard(page).getByRole('button', { name: 'Revisar' }).click()
  expect(await tooSmall(inSection), 'revisar').toEqual([])
  await section(page)
    .getByRole('button', { name: /en orden/ })
    .click()
  expect(await tooSmall(inSection), 'revisar en orden').toEqual([])
  await section(page).getByRole('button', { name: 'Volver a este mes' }).click()

  // Preparar, with a group sheet and the starting point.
  await section(page)
    .getByRole('button', { name: /Preparar abril/ })
    .click()
  expect(await tooSmall(inSection), 'preparar').toEqual([])
  await section(page).locator('[data-prepare-group="expense"]').click()
  expect(await tooSmall(inDialog), 'grupo').toEqual([])
  await page.keyboard.press('Escape')
  await section(page)
    .getByRole('button', { name: /Partiendo de/ })
    .click()
  expect(await tooSmall(inDialog), 'partir de').toEqual([])
})

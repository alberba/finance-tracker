import type { Page } from '@playwright/test'
import type { Month } from '../../src/lib/month'
import type { TransactionType } from '../../src/scripts/types'
import { test, expect } from './fixtures'
import type { FinanceTrackerPage } from './pages/FinanceTrackerPage'
import { editScenarioState } from './seed-sync-v2'

/**
 * Movimientos en el marco móvil (#432), en el proyecto móvil.
 * El reloj está en marzo de
 * 2026, el mes más reciente de la semilla. Las cifras las prueba el unit del
 * view-model; aquí, lo que hace el usuario y lo que obtiene.
 */
test.use({ fixedTime: '2026-03-20T12:00:00Z' })

const section = (page: Page) => page.locator('#transactions')
const ledger = (page: Page) => section(page).locator('[data-tx-ledger]')
const row = (page: Page, description: string) =>
  ledger(page).locator('[data-tx-id]').filter({ hasText: description })
const sheet = (page: Page, name: string) => page.getByRole('dialog', { name })
const filtersButton = (page: Page) => page.getByRole('button', { name: /^Filtros/ })
const searchChip = (page: Page, text: string) =>
  section(page)
    .getByRole('group', { name: 'Filtros activos' })
    .getByRole('button', { name: `Quitar filtro: «${text}»` })

/** The top bar's search: a sheet with the field; the text comes back as a chip. */
async function searchFor(page: Page, text: string): Promise<void> {
  await page.getByRole('button', { name: 'Buscar movimientos' }).click()
  const field = sheet(page, 'Buscar movimientos').getByRole('searchbox', {
    name: 'Buscar movimientos',
  })
  await field.fill(text)
  await field.press('Enter')
  await expect(searchChip(page, text)).toBeVisible()
}

async function addMovements(
  page: Page,
  tracker: FinanceTrackerPage,
  movements: Array<{ id: string; type: TransactionType; amount: number; date: string }>,
): Promise<void> {
  await page.goto('/movimientos')
  await expect(page.locator('html[data-finance-ready="true"]')).toBeVisible()
  await editScenarioState(page, (state) => {
    for (const movement of movements) {
      state.transactions.push({
        id: movement.id,
        date: movement.date,
        month: Number(movement.date.slice(5, 7)) as Month,
        type: movement.type,
        accountId: state.accounts[0].id,
        category: movement.type === 'income' ? 'Nómina' : 'Comida',
        description: movement.id,
        amount: movement.amount,
      })
    }
  })
  await tracker.open('transactions')
}

test('busca, filtra por tipo y por importe desde «Filtros»', async ({ page, tracker }) => {
  await addMovements(page, tracker, [
    { id: 'e2e-movil-ingreso', type: 'income', amount: 120, date: '2026-03-10' },
    { id: 'e2e-movil-gasto', type: 'expense', amount: 30, date: '2026-03-11' },
    { id: 'e2e-movil-gasto-grande', type: 'expense', amount: 300, date: '2026-03-12' },
  ])

  await searchFor(page, 'e2e-movil')
  await expect(ledger(page).locator('[data-tx-id]')).toHaveCount(3)

  await filtersButton(page).click()
  const filters = sheet(page, 'Filtros')
  await filters.getByRole('button', { name: 'Gastos', exact: true }).click()
  await expect(ledger(page).locator('[data-tx-id]')).toHaveCount(2)
  await expect(row(page, 'e2e-movil-ingreso')).toHaveCount(0)

  await filters.getByLabel('Mínimo').fill('100')
  await expect(ledger(page).locator('[data-tx-id]')).toHaveCount(1)
  await filters.getByRole('button', { name: /^Ver 1 movimiento/ }).click()
  await expect(filters).toBeHidden()

  await expect(row(page, 'e2e-movil-gasto-grande')).toBeVisible()
  await expect(page.getByRole('button', { name: 'Filtros, 2 activos' })).toBeVisible()
  await expect(section(page).locator('[data-registry-total]')).toHaveText('300,00 €')
})

test('mantiene la posición al pasar de movimientos a ningún resultado y volver', async ({
  page,
  tracker,
}) => {
  await page.emulateMedia({ reducedMotion: 'reduce' })
  await addMovements(
    page,
    tracker,
    Array.from({ length: 12 }, (_, index) => ({
      id: `e2e-movil-scroll-${index}`,
      type: 'expense',
      amount: 30,
      date: '2026-03-12',
    })),
  )

  // The filter chips under the month line push the list down once; open them
  // first so the scroll below is only about the list swapping.
  const filters = sheet(page, 'Filtros')
  const setMinimum = async (amount: string, shown: RegExp) => {
    await filtersButton(page).click()
    await filters.getByLabel('Mínimo').fill(amount)
    await filters.getByRole('button', { name: shown }).click()
    await expect(filters).toBeHidden()
  }
  await setMinimum('1', /^Ver \d+ movimientos/)
  await expect(row(page, 'e2e-movil-scroll-0')).toBeVisible()

  const scrollPosition = () => page.evaluate(() => window.scrollY)
  await page.evaluate(() => window.scrollTo(0, 210))
  await expect.poll(scrollPosition).toBe(210)

  // An amount nothing reaches empties the list; the page stays where it was.
  await setMinimum('999999', /^Ver 0 movimientos/)
  await expect(section(page).getByText(/Ningún movimiento de/)).toBeVisible()
  expect(await scrollPosition()).toBe(210)

  await setMinimum('1', /^Ver \d+ movimientos/)
  await expect(row(page, 'e2e-movil-scroll-0')).toBeVisible()
  expect(await scrollPosition()).toBe(210)
})

test('todos los controles de Movimientos miden al menos 44 px con puntero táctil', async ({
  page,
  tracker,
}) => {
  await addMovements(page, tracker, [
    { id: 'e2e-movil-tactil', type: 'expense', amount: 30, date: '2026-03-12' },
  ])
  expect(await page.evaluate(() => matchMedia('(pointer: coarse)').matches)).toBe(true)

  const tooSmall = (selector: string, min = 44) =>
    page.locator(selector).evaluateAll(
      (controls, size) =>
        controls
          .filter((control) => control.getClientRects().length > 0)
          .map((control) => {
            const { width, height } = control.getBoundingClientRect()
            const name = control.getAttribute('aria-label') || control.textContent?.trim()
            return { name, width: Math.round(width), height: Math.round(height) }
          })
          .filter(({ width, height }) => width < size || height < size),
      min,
    )
  // DESIGN.md: filter chips are compact (38 px); every other control is 44 px.
  const CHIP = '[aria-pressed]'
  const CONTROLS = `button:not(${CHIP}), a[href], input, select`
  const inSection = `#transactions :is(${CONTROLS})`
  const inSheet = `dialog[open] :is(${CONTROLS})`
  const chips = (scope: string) => tooSmall(`${scope} ${CHIP}`, 38)

  expect(await tooSmall(inSection)).toEqual([])

  await filtersButton(page).click()
  await expect(sheet(page, 'Filtros')).toBeVisible()
  expect(await tooSmall(inSheet)).toEqual([])
  expect(await chips('dialog[open]')).toEqual([])
  await page.keyboard.press('Escape')
  await expect(sheet(page, 'Filtros')).toBeHidden()

  await page.getByRole('button', { name: 'Buscar movimientos' }).click()
  await expect(sheet(page, 'Buscar movimientos')).toBeVisible()
  expect(await tooSmall(inSheet)).toEqual([])
  await page.keyboard.press('Escape')
  await expect(sheet(page, 'Buscar movimientos')).toBeHidden()

  await row(page, 'e2e-movil-tactil').click()
  const detail = sheet(page, 'e2e-movil-tactil')
  await detail.getByRole('button', { name: 'Editar' }).click()
  expect(await tooSmall(inSheet)).toEqual([])
  await page.keyboard.press('Escape')
  await expect(detail).toBeHidden()

  await ledger(page).getByRole('button', { name: 'Seleccionar e2e-movil-tactil' }).click()
  expect(await tooSmall(inSection)).toEqual([])
  await section(page)
    .getByRole('region', { name: 'Acciones sobre la selección' })
    .getByRole('button', { name: 'Terminar la selección' })
    .click()
  await expect(section(page).locator('[data-bulk-bar]')).toHaveCount(0)

  // «Exportar» is in the footer of the month picker.
  await section(page)
    .getByRole('button', { name: /elegir otro mes/ })
    .click()
  await expect(sheet(page, 'Elegir mes')).toBeVisible()
  expect(await tooSmall(inSheet)).toEqual([])
  await sheet(page, 'Elegir mes').getByRole('button', { name: 'Exportar' }).click()
  await expect(sheet(page, 'Informe mensual')).toBeVisible()
  expect(await tooSmall(inSheet)).toEqual([])
  await page.keyboard.press('Escape')
  await expect(sheet(page, 'Informe mensual')).toBeHidden()

  await section(page)
    .getByRole('tab', { name: /Suscripciones/ })
    .click()
  expect(await tooSmall(inSection)).toEqual([])
})

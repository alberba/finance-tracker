import type { Page } from '@playwright/test'
import type { Month } from '../../src/lib/month'
import type { TransactionType } from '../../src/scripts/types'
import { test, expect } from './fixtures'
import type { FinanceTrackerPage } from './pages/FinanceTrackerPage'
import { expectSyncCommand } from './pages/sync'
import { editScenarioState } from './seed-sync-v2'

/**
 * Movimientos del diseño nuevo en el marco móvil (#432), en el proyecto móvil.
 * Sin cookie: el diseño nuevo es el de por defecto. El reloj está en marzo de
 * 2026, el mes más reciente de la semilla. Las cifras las prueba el unit del
 * view-model; aquí, lo que hace el usuario y lo que obtiene.
 */
const NO_COOKIE = { cookies: [], origins: [] }

test.use({ storageState: NO_COOKIE, fixedTime: '2026-03-20T12:00:00Z' })

const section = (page: Page) => page.locator('#transactions')
const ledger = (page: Page) => section(page).locator('[data-tx-ledger]')
const row = (page: Page, description: string) =>
  ledger(page).locator('[data-tx-id]').filter({ hasText: description })
const search = (page: Page) => section(page).getByRole('searchbox', { name: 'Buscar movimientos' })
const sheet = (page: Page, name: string) => page.getByRole('dialog', { name })

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

test('busca, filtra por tipo y por importe con «Más filtros»', async ({ page, tracker }) => {
  await addMovements(page, tracker, [
    { id: 'e2e-movil-ingreso', type: 'income', amount: 120, date: '2026-03-10' },
    { id: 'e2e-movil-gasto', type: 'expense', amount: 30, date: '2026-03-11' },
    { id: 'e2e-movil-gasto-grande', type: 'expense', amount: 300, date: '2026-03-12' },
  ])

  await search(page).fill('e2e-movil')
  await expect(ledger(page).locator('[data-tx-id]')).toHaveCount(3)

  const types = section(page).getByRole('group', { name: 'Filtrar por tipo' })
  await types.getByRole('button', { name: 'Gastos' }).click()
  await expect(ledger(page).locator('[data-tx-id]')).toHaveCount(2)
  await expect(row(page, 'e2e-movil-ingreso')).toHaveCount(0)

  await section(page)
    .getByRole('button', { name: /^Más filtros/ })
    .click()
  await section(page).getByLabel('Importe mín.').fill('100')

  await expect(ledger(page).locator('[data-tx-id]')).toHaveCount(1)
  await expect(row(page, 'e2e-movil-gasto-grande')).toBeVisible()
  await expect(section(page).getByRole('button', { name: /^Más filtros · 1/ })).toBeVisible()
  await expect(section(page).locator('[data-registry-total]')).toHaveText('300,00 €')
})

test('abre un movimiento en la hoja, lo edita y el cambio sigue al recargar', async ({
  page,
  tracker,
}) => {
  await addMovements(page, tracker, [
    { id: 'e2e-movil-editar', type: 'expense', amount: 30, date: '2026-03-12' },
  ])

  await row(page, 'e2e-movil-editar').click()
  const detail = sheet(page, 'e2e-movil-editar')
  await expect(detail).toBeVisible()
  await expect(detail.locator('[data-detail-amount]')).toHaveText('−30,00 €')

  await detail.getByRole('button', { name: 'Editar' }).click()
  await detail.getByLabel('Importe').fill('45,50')
  await detail.getByLabel('Descripción').fill('e2e-movil-editado')
  const saved = expectSyncCommand(
    page,
    (command) =>
      command.action === 'update' &&
      command.entityType === 'transaction' &&
      command.patch.description === 'e2e-movil-editado',
  )
  await detail.getByRole('button', { name: 'Guardar' }).click()
  await saved

  const edited = sheet(page, 'e2e-movil-editado')
  await expect(edited.locator('[data-detail-amount]')).toHaveText('−45,50 €')
  await edited.getByRole('button', { name: 'Cerrar' }).click()
  await expect(edited).toBeHidden()

  await tracker.reload()
  await expect(row(page, 'e2e-movil-editado').locator('[data-tx-amount]')).toHaveText('−45,50 €')
})

test('todos los controles de Movimientos miden al menos 44 px con puntero táctil', async ({
  page,
  tracker,
}) => {
  await addMovements(page, tracker, [
    { id: 'e2e-movil-tactil', type: 'expense', amount: 30, date: '2026-03-12' },
  ])
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
  const inSection = `#transactions :is(${CONTROLS})`
  const inSheet = `dialog[open] :is(${CONTROLS})`

  expect(await tooSmall(inSection)).toEqual([])

  await section(page)
    .getByRole('button', { name: /^Más filtros/ })
    .click()
  await expect(section(page).getByLabel('Importe mín.')).toBeVisible()
  expect(await tooSmall(inSection)).toEqual([])

  await row(page, 'e2e-movil-tactil').click()
  const detail = sheet(page, 'e2e-movil-tactil')
  await detail.getByRole('button', { name: 'Editar' }).click()
  expect(await tooSmall(inSheet)).toEqual([])
  await page.keyboard.press('Escape')
  await expect(detail).toBeHidden()

  await section(page).getByRole('button', { name: 'Seleccionar', exact: true }).click()
  expect(await tooSmall(inSection)).toEqual([])
  await section(page)
    .getByRole('region', { name: 'Acciones sobre la selección' })
    .getByRole('button', { name: 'Terminar la selección' })
    .click()
  await expect(section(page).locator('[data-bulk-bar]')).toHaveCount(0)

  await section(page).getByRole('button', { name: 'Exportar' }).click()
  await expect(sheet(page, 'Informe mensual')).toBeVisible()
  expect(await tooSmall(inSheet)).toEqual([])
  await page.keyboard.press('Escape')
  await expect(sheet(page, 'Informe mensual')).toBeHidden()

  await section(page)
    .getByRole('tab', { name: /Suscripciones/ })
    .click()
  expect(await tooSmall(inSection)).toEqual([])
})

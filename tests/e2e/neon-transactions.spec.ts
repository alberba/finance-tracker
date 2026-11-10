import type { Page } from '@playwright/test'
import type { Month } from '../../src/lib/month'
import type { TransactionType } from '../../src/scripts/types'
import { test, expect } from './fixtures'
import type { FinanceTrackerPage } from './pages/FinanceTrackerPage'
import { expectSyncCommand } from './pages/sync'
import { editScenarioState } from './seed-sync-v2'

/**
 * Movimientos in the new design (#431), desktop. No cookie: the new design is
 * the default. The clock sits in March 2026, the newest month of the seed.
 */
const NO_COOKIE = { cookies: [], origins: [] }

test.use({ storageState: NO_COOKIE, fixedTime: '2026-03-20T12:00:00Z' })

const section = (page: Page) => page.locator('#transactions')
const ledger = (page: Page) => section(page).locator('[data-tx-ledger]')
const row = (page: Page, description: string) =>
  ledger(page).locator('[data-tx-id]').filter({ hasText: description })
const month = (page: Page, title: string) =>
  ledger(page)
    .locator('[data-ledger-month]')
    .filter({
      has: page.getByRole('heading', { name: title, exact: true }),
    })
const search = (page: Page) => section(page).getByRole('searchbox', { name: 'Buscar movimientos' })
const detail = (page: Page, title: string) => page.getByRole('dialog', { name: title })

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

test.describe('Movimientos en el diseño nuevo', () => {
  test('busca un movimiento por texto y filtra por tipo', async ({ page, tracker }) => {
    await addMovements(page, tracker, [
      { id: 'e2e-filtro-ingreso', type: 'income', amount: 120, date: '2026-03-10' },
      { id: 'e2e-filtro-gasto', type: 'expense', amount: 30, date: '2026-03-11' },
    ])

    await search(page).fill('e2e-filtro')
    await expect(ledger(page).locator('[data-tx-id]')).toHaveCount(2)
    await expect(section(page).locator('[data-registry-total]')).toHaveText('+90,00 €')

    const types = section(page).getByRole('group', { name: 'Filtrar por tipo' })
    await types.getByRole('button', { name: 'Gastos' }).click()
    await expect(types.getByRole('button', { name: 'Gastos' })).toHaveAttribute(
      'aria-pressed',
      'true',
    )
    await expect(ledger(page).locator('[data-tx-id]')).toHaveCount(1)
    await expect(row(page, 'e2e-filtro-gasto')).toBeVisible()
    await expect(section(page).locator('[data-registry-total]')).toHaveText('30,00 €')

    // Pressing the chosen type again shows every type.
    await types.getByRole('button', { name: 'Gastos' }).click()
    await expect(ledger(page).locator('[data-tx-id]')).toHaveCount(2)

    await search(page).fill('nada coincide con esto')
    await expect(section(page).getByText('Ningún movimiento de 2026 coincide')).toBeVisible()
  })

  test('abre un movimiento, lo edita y el cambio sigue al recargar', async ({ page, tracker }) => {
    await addMovements(page, tracker, [
      { id: 'e2e-editar', type: 'expense', amount: 30, date: '2026-03-12' },
    ])

    await row(page, 'e2e-editar').click()
    const panel = detail(page, 'e2e-editar')
    await expect(panel).toBeVisible()
    await expect(panel.locator('[data-detail-amount]')).toHaveText('−30,00 €')

    await panel.getByRole('button', { name: 'Editar' }).click()
    await panel.getByLabel('Importe').fill('45,50')
    await panel.getByLabel('Descripción').fill('e2e-editado')
    const saved = expectSyncCommand(
      page,
      (command) =>
        command.action === 'update' &&
        command.entityType === 'transaction' &&
        command.patch.description === 'e2e-editado',
    )
    await panel.getByRole('button', { name: 'Guardar' }).click()
    await saved

    await expect(detail(page, 'e2e-editado').locator('[data-detail-amount]')).toHaveText('−45,50 €')
    await tracker.reload()
    await expect(row(page, 'e2e-editado').locator('[data-tx-amount]')).toHaveText('−45,50 €')
    await expect(row(page, 'e2e-editar')).toHaveCount(0)
  })

  test('borra un movimiento y lo recupera desde el aviso', async ({ page, tracker }) => {
    await addMovements(page, tracker, [
      { id: 'e2e-borrar', type: 'expense', amount: 13, date: '2026-03-13' },
    ])

    await row(page, 'e2e-borrar').click()
    const removed = expectSyncCommand(
      page,
      (command) => command.action === 'remove' && command.entityType === 'transaction',
    )
    await detail(page, 'e2e-borrar').getByRole('button', { name: 'Eliminar' }).click()
    const notice = page.locator('[data-undo-toast]')
    await expect(notice).toContainText('Movimiento eliminado: e2e-borrar')
    await expect(row(page, 'e2e-borrar')).toHaveCount(0)
    await removed

    const restored = expectSyncCommand(
      page,
      (command) =>
        command.action === 'create' &&
        command.entityType === 'transaction' &&
        command.data.description === 'e2e-borrar',
    )
    await notice.getByRole('button', { name: 'Deshacer' }).click()
    await expect(notice).toBeHidden()
    await expect(row(page, 'e2e-borrar')).toBeVisible()
    await restored

    await tracker.reload()
    await expect(row(page, 'e2e-borrar').locator('[data-tx-amount]')).toHaveText('−13,00 €')
  })

  test('despliega los meses antiguos plegados', async ({ page, tracker }) => {
    await page.goto('/movimientos')
    await tracker.open('transactions')

    await expect(month(page, 'Marzo 2026')).toBeVisible()
    await expect(month(page, 'Febrero 2026')).toHaveCount(0)

    await section(page)
      .getByRole('button', { name: /^Ver febrero y anteriores/ })
      .click()

    // February in `src/data/seed.json`: 2085 in, 404.77 out, 200 invested.
    await expect(month(page, 'Febrero 2026')).toContainText('13 movimientos · neto +1.480,23 €')
    await expect(month(page, 'Enero 2026')).toBeVisible()
  })

  test('apunta un movimiento desde la cabecera y aparece en el registro', async ({
    page,
    tracker,
  }) => {
    await page.goto('/movimientos')
    await tracker.open('transactions')

    await section(page).getByRole('button', { name: 'Nuevo movimiento' }).click()
    const sheet = page.getByRole('dialog', { name: 'Apuntar' })
    await sheet.getByRole('textbox', { name: 'Importe' }).fill('8,20')
    await sheet.getByLabel('Descripción').fill('e2e-alta-cabecera')
    await sheet.getByRole('button', { name: 'Guardar' }).click()
    await expect(sheet).toBeHidden()

    await expect(row(page, 'e2e-alta-cabecera').locator('[data-tx-amount]')).toHaveText('−8,20 €')
  })

  test('exporta el informe de un periodo como PDF y CSV', async ({ page, tracker }) => {
    await page.goto('/movimientos')
    await tracker.open('transactions')

    await section(page).getByRole('button', { name: 'Exportar' }).click()
    const panel = page.getByRole('dialog', { name: 'Informe mensual' })
    await expect(panel).toBeVisible()

    await panel.getByLabel('Desde').fill('2026-02-01')
    await panel.getByLabel('Hasta').fill('2026-02-28')
    const summary = panel.locator('[data-report-summary]')
    await expect(summary).toContainText('13 movimientos')
    await expect(summary).toContainText(/Ingresos\s*2\.085,00/)
    await expect(summary).toContainText(/Gastos\s*404,77/)

    await panel.getByLabel('Hasta').fill('2999-01-01')
    await expect(panel.locator('[data-report-error]')).toContainText('futura')
    await expect(panel.getByRole('button', { name: 'Descargar PDF' })).toBeDisabled()
    await panel.getByLabel('Hasta').fill('2026-02-28')

    const pdf = page.waitForEvent('download')
    await panel.getByRole('button', { name: 'Descargar PDF' }).click()
    expect((await pdf).suggestedFilename()).toBe('Informe 2026-02-01 - 2026-02-28.pdf')

    const csv = page.waitForEvent('download')
    await panel.getByRole('button', { name: 'Descargar CSV' }).click()
    expect((await csv).suggestedFilename()).toBe('movimientos-2026-02-01-2026-02-28.csv')
  })

  test('selecciona varios movimientos, los cambia de golpe y los borra tras confirmar', async ({
    page,
    tracker,
  }) => {
    await addMovements(page, tracker, [
      { id: 'e2e-lote-a', type: 'expense', amount: 11, date: '2026-03-11' },
      { id: 'e2e-lote-b', type: 'expense', amount: 12, date: '2026-03-12' },
    ])
    await search(page).fill('e2e-lote')

    await section(page).getByRole('button', { name: 'Seleccionar', exact: true }).click()
    const bar = section(page).getByRole('region', { name: 'Acciones sobre la selección' })
    await ledger(page)
      .getByRole('checkbox', { name: /^e2e-lote-a/ })
      .click()
    await ledger(page)
      .getByRole('checkbox', { name: /^e2e-lote-b/ })
      .click()
    await expect(bar).toContainText('2 seleccionados')
    await expect(bar).toContainText('−23,00 €')

    await bar.getByLabel('Cambiar tipo').selectOption('investment')
    await bar.getByLabel('Cambiar categoría').selectOption('Fondos Indexados')
    await bar.getByRole('button', { name: 'Aplicar' }).click()
    await expect(row(page, 'Fondos Indexados')).toHaveCount(2)
    await expect(bar).toContainText('2 seleccionados')

    // The change stays after reloading.
    await tracker.reload()
    await search(page).fill('e2e-lote')
    await expect(row(page, 'Fondos Indexados')).toHaveCount(2)
    await section(page).getByRole('button', { name: 'Seleccionar', exact: true }).click()
    await section(page).getByRole('button', { name: 'Seleccionar todo' }).click()

    await bar.getByRole('button', { name: 'Eliminar', exact: true }).click()
    const confirm = bar.getByRole('alertdialog', { name: /¿Eliminar 2 movimientos\?/ })
    await expect(confirm).toContainText('No se puede deshacer')
    const removed = expectSyncCommand(
      page,
      (command) => command.action === 'remove' && command.entityType === 'transaction',
    )
    await confirm.getByRole('button', { name: 'Eliminar 2 movimientos' }).click()
    await removed
    await expect(ledger(page)).toHaveCount(0)

    await tracker.reload()
    await search(page).fill('e2e-lote')
    await expect(ledger(page)).toHaveCount(0)
  })
})

import type { Page } from '@playwright/test'
import { test, expect } from './fixtures'
import { expectSyncCommand } from './pages/sync'
import { editScenarioState, readScenarioState } from './seed-sync-v2'
import type { RecurringRule } from '../../src/scripts/types'

/**
 * Recorridos del dashboard en el diseño nuevo (#429). Sin cookie: el diseño
 * nuevo es el de por defecto. Las cifras y estados del bloque los prueba el
 * unit del view-model; aquí, lo que hace el usuario y lo que obtiene.
 */
const NO_COOKIE = { cookies: [], origins: [] }

test.use({ storageState: NO_COOKIE, fixedTime: '2026-07-10T10:00:00' })
test.beforeEach(async ({ page }) => {
  await page.setViewportSize({ width: 1440, height: 900 })
})

const dashboard = (page: Page) => page.locator('#dashboard')
const card = (page: Page, name: string) =>
  dashboard(page).getByRole('region', { name, exact: true })

/** «1.233,55 €» → 1233.55 */
function amountOf(text: string): number {
  return Number(
    text
      .replace(/[^\d,−-]/g, '')
      .replace('−', '-')
      .replace(',', '.'),
  )
}

test('apuntar un gasto desde «Apuntar» baja «Te quedan» ese importe', async ({ page, tracker }) => {
  const left = dashboard(page).locator('[data-dashboard-left]')
  const before = amountOf(await left.innerText())

  await dashboard(page).getByRole('button', { name: 'Apuntar', exact: true }).click()
  const sheet = page.getByRole('dialog', { name: 'Apuntar' })
  await sheet.getByRole('textbox', { name: 'Importe' }).fill('12,34')
  await sheet.getByLabel('Descripción').fill('Café del dashboard')
  const created = expectSyncCommand(
    page,
    (command) => command.action === 'create' && command.entityType === 'transaction',
  )
  await sheet.getByRole('button', { name: 'Guardar' }).click()
  await created

  await expect.poll(async () => amountOf(await left.innerText())).toBeCloseTo(before - 12.34, 2)
  await expect(card(page, 'Movimientos').getByText('Café del dashboard')).toBeVisible()

  await tracker.reload()
  await expect.poll(async () => amountOf(await left.innerText())).toBeCloseTo(before - 12.34, 2)
})

test('confirma un pendiente uno a uno y luego todos a la vez', async ({ page, tracker }) => {
  await editScenarioState(page, (state) => {
    const rule = (id: string, description: string, amount: number, day: string): RecurringRule => ({
      id,
      type: 'expense',
      accountId: state.accounts[0].id,
      category: state.expenseCategories[0],
      description,
      amount,
      frequency: 'monthly',
      interval: 1,
      startDate: `2026-07-${day}`,
      endDate: null,
      active: true,
      lastExecutionDate: null,
      nextOccurrenceDate: `2026-07-${day}`,
    })
    state.recurringRules.push(
      rule('rent-rule', 'Alquiler', 900, '01'),
      rule('gym-rule', 'Gimnasio', 39.9, '03'),
      rule('music-rule', 'Música', 9.99, '05'),
    )
  })
  await tracker.reload()

  const pending = card(page, 'Por confirmar')
  await expect(pending.getByRole('listitem').first()).toBeVisible()

  const isConfirmation = (command: Parameters<Parameters<typeof expectSyncCommand>[1]>[0]) =>
    command.action === 'update' &&
    command.entityType === 'pendingMovement' &&
    command.patch.status === 'confirmed'

  // The compact card only displays rows that fit. Confirm one visible item
  // before checking that the bulk action also handles items outside the list.
  const confirmFirst = pending.getByRole('button', { name: /^Confirmar (?!todo$)/ }).first()
  const confirmedLabel = await confirmFirst.getAttribute('aria-label')
  const one = expectSyncCommand(page, isConfirmation)
  await confirmFirst.click()
  await one
  await expect(pending.getByRole('button', { name: confirmedLabel!, exact: true })).toHaveCount(0)

  const rest = expectSyncCommand(page, isConfirmation, 2)
  await pending.getByRole('button', { name: 'Confirmar todo' }).click()
  await rest
  await expect(pending.getByText('Nada por confirmar.', { exact: false })).toBeVisible()

  await tracker.reload()
  await expect(
    card(page, 'Por confirmar').getByText('Nada por confirmar.', { exact: false }),
  ).toBeVisible()
  const state = await readScenarioState(page)
  const ours = state.pendingMovements.filter((item) => item.ruleId.endsWith('-rule'))
  expect(ours.map((item) => item.status)).toEqual(['confirmed', 'confirmed', 'confirmed'])
  const created = new Set(ours.map((item) => item.transactionId))
  expect(state.transactions.filter((tx) => created.has(tx.id))).toHaveLength(3)
})

test('busca un movimiento desde la cabecera y llega a Movimientos con la búsqueda aplicada', async ({
  page,
  tracker,
}) => {
  await dashboard(page)
    .getByRole('searchbox', { name: 'Buscar movimientos' })
    .fill('Compra semanal')
  await dashboard(page).getByRole('searchbox', { name: 'Buscar movimientos' }).press('Enter')

  await expect(page).toHaveURL(/\/movimientos$/)
  await expect(
    tracker.transactionsSection.getByRole('searchbox', { name: 'Buscar movimientos' }),
  ).toHaveValue('Compra semanal')
  await expect(tracker.transactionsSection.getByText('Nómina mensual')).toHaveCount(0)
})

test('el rango del patrimonio se conserva al salir de la sección y volver', async ({
  page,
  tracker,
}) => {
  const range = card(page, 'Patrimonio').getByRole('group', { name: 'Rango del gráfico' })
  await expect(range.getByRole('button', { name: '1A' })).toHaveAttribute('aria-pressed', 'true')
  await range.getByRole('button', { name: '6M' }).click()
  await expect(range.getByRole('button', { name: '6M' })).toHaveAttribute('aria-pressed', 'true')

  await tracker.openBudget()
  await tracker.openDashboard()
  await expect(range.getByRole('button', { name: '6M' })).toHaveAttribute('aria-pressed', 'true')
  await expect(range.getByRole('button', { name: '1A' })).toHaveAttribute('aria-pressed', 'false')
})

test('va a una sección desde el enlace de un bloque y vuelve con atrás', async ({
  page,
  tracker,
}) => {
  await card(page, 'Gasto por categoría').getByRole('link', { name: 'Ir a Presupuesto' }).click()
  await expect(page).toHaveURL(/\/presupuesto$/)
  await expect(page.locator('#budget')).toBeVisible()

  await page.goBack()
  await expect(page).toHaveURL(/\/$/)
  await expect(
    tracker.dashboardSection.getByRole('heading', { level: 1, name: 'Así va julio' }),
  ).toBeVisible()
})

test('guarda el tamaño y los widgets del inicio y permite restablecerlos tras recargar', async ({
  page,
  tracker,
}) => {
  await dashboard(page).getByRole('button', { name: 'Editar distribución', exact: true }).click()
  const resized = expectSyncCommand(
    page,
    (command) =>
      command.action === 'settingsUpdate' &&
      command.patch.dashboardLayout?.items.some((item) => item.id === 'month' && item.w === 3) ===
        true,
  )
  await dashboard(page)
    .getByRole('group', { name: /^Te quedan\. Flechas/ })
    .press('Shift+ArrowRight')
  await resized

  const saved = expectSyncCommand(
    page,
    (command) =>
      command.action === 'settingsUpdate' &&
      command.patch.dashboardLayout?.items.every((item) => item.id !== 'goals') === true,
  )
  await dashboard(page)
    .getByRole('button', { name: 'Quitar Objetivos del inicio', exact: true })
    .click()
  await saved
  await tracker.reload()
  await expect(card(page, 'Objetivos')).toHaveCount(0)
  const monthWidget = dashboard(page).locator('[data-widget="month"]')
  await expect(monthWidget).toHaveCSS('--w', '3')
  await dashboard(page).getByRole('button', { name: 'Editar distribución', exact: true }).click()
  const bar = dashboard(page).getByRole('region', { name: 'Edición del inicio' })
  await bar.getByRole('button', { name: 'Restablecer', exact: true }).click()
  const reset = expectSyncCommand(
    page,
    (command) => command.action === 'settingsUpdate' && command.patch.dashboardLayout === null,
  )
  await bar.getByRole('button', { name: 'Restablecer', exact: true }).click()
  await reset
  await tracker.reload()
  await expect(card(page, 'Objetivos')).toBeVisible()
  await expect(monthWidget).toHaveCSS('--w', '2')
})

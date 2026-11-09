import type { Page } from '@playwright/test'
import { test, expect } from './fixtures'
import { expectSyncCommand } from './pages/sync'
import { editScenarioState, readScenarioState } from './seed-sync-v2'
import type { RecurringRule } from '../../src/scripts/types'

/**
 * Recorridos del dashboard nuevo en el marco móvil (#430), en el proyecto
 * móvil. Sin cookie: el diseño nuevo es el de por defecto. Las cifras las
 * prueba el unit del view-model; aquí, lo que hace el usuario y lo que obtiene.
 */
const NO_COOKIE = { cookies: [], origins: [] }

test.use({ storageState: NO_COOKIE, fixedTime: '2026-07-10T10:00:00' })

const dashboard = (page: Page) => page.locator('#dashboard')
const left = (page: Page) => dashboard(page).locator('[data-dashboard-left]')
const pendingSheet = (page: Page) => page.getByRole('dialog', { name: 'Por confirmar' })

/** «1.233,55 €» → 1233.55 */
function amountOf(text: string): number {
  return Number(
    text
      .replace(/[^\d,−-]/g, '')
      .replace('−', '-')
      .replace(',', '.'),
  )
}

async function addMonthlyRules(page: Page, rules: Array<[string, string, number]>): Promise<void> {
  await editScenarioState(page, (state) => {
    for (const [id, description, amount] of rules) {
      state.recurringRules.push({
        id,
        type: 'expense',
        accountId: state.accounts[0].id,
        category: state.expenseCategories[0],
        description,
        amount,
        frequency: 'monthly',
        interval: 1,
        startDate: '2026-07-01',
        endDate: null,
        active: true,
        lastExecutionDate: null,
        nextOccurrenceDate: '2026-07-01',
      } satisfies RecurringRule)
    }
  })
}

test('apuntar un gasto desde el FAB baja «Te quedan» ese importe', async ({ page, tracker }) => {
  await expect(tracker.dashboardSection).toBeVisible()
  const before = amountOf(await left(page).innerText())

  await page.locator('[data-fab-apuntar]').click()
  const sheet = page.getByRole('dialog', { name: 'Apuntar' })
  await sheet.getByRole('textbox', { name: 'Importe' }).fill('12,34')
  await sheet.getByLabel('Descripción').fill('Café del móvil')
  const created = expectSyncCommand(
    page,
    (command) => command.action === 'create' && command.entityType === 'transaction',
  )
  await sheet.getByRole('button', { name: 'Guardar' }).click()
  await created

  await expect
    .poll(async () => amountOf(await left(page).innerText()))
    .toBeCloseTo(before - 12.34, 2)
  await expect(
    dashboard(page)
      .getByRole('list', { name: 'Movimientos recientes' })
      .getByText('Café del móvil'),
  ).toBeVisible()
})

test('confirma un pendiente desde la hoja «Por confirmar» de la cifra', async ({
  page,
  tracker,
}) => {
  await addMonthlyRules(page, [
    ['rent-rule', 'Alquiler', 900],
    ['gym-rule', 'Gimnasio', 39.9],
  ])
  await tracker.reload()
  const before = amountOf(await left(page).innerText())

  await dashboard(page)
    .getByRole('button', { name: /por confirmar$/ })
    .click()
  await expect(pendingSheet(page).locator('[data-pending-item]')).toHaveCount(2)

  const confirmed = expectSyncCommand(
    page,
    (command) =>
      command.action === 'update' &&
      command.entityType === 'pendingMovement' &&
      command.patch.status === 'confirmed',
  )
  await pendingSheet(page).getByRole('button', { name: 'Confirmar Alquiler' }).click()
  await confirmed

  await expect(pendingSheet(page).locator('[data-pending-item]')).toHaveCount(1)
  await expect(page.locator('[data-pending-trigger]')).toHaveAccessibleName(
    'Por confirmar, 1 pendientes',
  )
  await expect.poll(async () => amountOf(await left(page).innerText())).toBeCloseTo(before - 900, 2)

  await tracker.reload()
  const state = await readScenarioState(page)
  const statusOf = (ruleId: string) =>
    state.pendingMovements.find((item) => item.ruleId === ruleId)?.status
  expect(statusOf('rent-rule')).toBe('confirmed')
  expect(statusOf('gym-rule')).toBe('pending')
})

test('busca un movimiento desde la barra superior y llega a Movimientos filtrado', async ({
  page,
  tracker,
}) => {
  await page.getByRole('button', { name: 'Buscar movimientos' }).click()
  const sheet = page.getByRole('dialog', { name: 'Buscar movimientos' })
  await sheet.getByRole('searchbox', { name: 'Buscar movimientos' }).fill('Compra semanal')
  await sheet.getByRole('searchbox', { name: 'Buscar movimientos' }).press('Enter')

  await expect(page).toHaveURL(/\/movimientos$/)
  await expect(
    tracker.transactionsSection.getByRole('searchbox', { name: 'Buscar movimientos' }),
  ).toHaveValue('Compra semanal')
})

test('todos los controles del dashboard miden al menos 44 px con puntero táctil', async ({
  page,
  tracker,
}) => {
  await addMonthlyRules(page, [
    ['rent-rule', 'Alquiler', 900],
    ['gym-rule', 'Gimnasio', 39.9],
  ])
  await tracker.reload()
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

  const CONTROLS = 'button, a[href], input'
  expect(
    await tooSmall(`#dashboard :is(${CONTROLS}), [data-mobile-app-bar] button, [data-fab-apuntar]`),
  ).toEqual([])

  await page.getByRole('button', { name: 'Buscar movimientos' }).click()
  await expect(page.getByRole('dialog', { name: 'Buscar movimientos' })).toBeVisible()
  expect(await tooSmall(`dialog[open] :is(${CONTROLS})`)).toEqual([])
  await page.keyboard.press('Escape')
  await expect(page.getByRole('dialog', { name: 'Buscar movimientos' })).toBeHidden()

  await dashboard(page)
    .getByRole('button', { name: /por confirmar$/ })
    .click()
  await expect(pendingSheet(page)).toBeVisible()
  expect(await tooSmall(`dialog[open] :is(${CONTROLS})`)).toEqual([])
})

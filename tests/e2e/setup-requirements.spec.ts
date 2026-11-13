import { randomUUID } from 'node:crypto'
import { test, expect } from './fixtures'
import { syncV2TestHeaders } from './seed-sync-v2'

test('los requisitos bloquean solo las acciones afectadas y se resuelven al crear una cuenta', async ({
  page,
  tracker,
  testUserEmail,
}) => {
  await tracker.goto()
  // Start from a clean slate through the supported state APIs: reset wipes the
  // seeded scenario (accounts, movements, categories) and re-seeds defaults,
  // then the welcome tour is marked complete so only setup requirements show.
  const headers = { 'X-Test-User-Email': testUserEmail }
  const reset = await page.request.post('/api/state/reset', { headers, data: {} })
  expect(reset.ok(), await reset.text()).toBe(true)
  const completed = await page.request.post('/api/sync', {
    headers: await syncV2TestHeaders(page.request, testUserEmail),
    data: {
      commands: [
        {
          commandId: randomUUID(),
          action: 'settingsUpdate',
          patch: { onboardingPresented: true, onboardingCompleted: true },
        },
      ],
    },
  })
  expect(completed.ok(), await completed.text()).toBe(true)
  await tracker.reload()

  await tracker.openTransactions()
  await expect(
    tracker.transactionsSection.getByRole('button', { name: 'Nuevo movimiento', exact: true }),
  ).toBeDisabled()
  await expect(
    tracker.transactionsSection.locator('[data-setup-requirement]').filter({ visible: true }),
  ).toContainText('Crea una cuenta')

  await tracker.openBudget()
  // La falta de cuentas no bloquea el presupuesto: el reset deja las categorías
  // por defecto y este apartado sigue operativo.
  await expect(
    tracker.budgetSection.locator('[data-setup-requirement]').filter({ visible: true }),
  ).toHaveCount(0)
  await tracker.budgetSection.getByRole('tab', { name: /Ingresos/ }).click()
  await expect(
    tracker.budgetSection.getByRole('table', { name: 'Ingresos por categoría y mes' }),
  ).toBeVisible()

  await tracker.openWealth()
  await expect(tracker.wealthSection.locator('[data-save-snapshot]')).toBeDisabled()
  await tracker.wealthSection.getByRole('button', { name: 'Crear cuenta', exact: true }).click()
  const panel = page.locator('#settings-account-panel')
  await expect(panel).toBeVisible()
  await panel.getByLabel('Nombre').fill('Cuenta inicial')
  await panel.getByLabel('Saldo inicial (€)').fill('0')
  await panel.getByRole('button', { name: 'Crear cuenta', exact: true }).click()
  await expect(panel).toBeHidden()

  await tracker.openTransactions()
  await expect(
    tracker.transactionsSection.getByRole('button', { name: 'Nuevo movimiento', exact: true }),
  ).toBeEnabled()
  await expect(tracker.transactionsSection.locator('[data-setup-requirement]')).toHaveCount(0)
  await tracker.openWealth()
  await expect(tracker.wealthSection.locator('[data-save-snapshot]')).toBeEnabled()

  await tracker.openSettingsCard('Cuentas', 'Cuenta inicial')
  await panel.getByRole('button', { name: 'Eliminar', exact: true }).click()
  await page
    .getByRole('alertdialog', { name: '¿Eliminar esta cuenta?' })
    .getByRole('button', { name: 'Eliminar cuenta', exact: true })
    .click()
  await tracker.openTransactions()
  await expect(
    tracker.transactionsSection.getByRole('button', { name: 'Nuevo movimiento', exact: true }),
  ).toBeDisabled()
  await expect(
    tracker.transactionsSection.getByRole('button', { name: 'Crear cuenta', exact: true }),
  ).toBeVisible()
})

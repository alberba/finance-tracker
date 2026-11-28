import { randomUUID } from 'node:crypto'
import { test, expect } from './fixtures'
import { syncV2TestHeaders } from './seed-sync-v2'

test('sin cuentas no se apuntan movimientos, y crear una lo desbloquea', async ({
  page,
  tracker,
  testUserEmail,
}) => {
  await tracker.goto()
  // Start from a clean slate through the supported state APIs: reset wipes the
  // seeded scenario (accounts, movements, categories) and re-seeds defaults,
  // then the setup wizard is marked complete so only setup requirements show.
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

  const create = tracker.transactionsSection.getByRole('button', {
    name: 'Nuevo movimiento',
    exact: true,
  })
  const requirement = tracker.transactionsSection.getByText(
    'Crea una cuenta en Configuración para registrar movimientos y suscripciones.',
  )
  await tracker.openTransactions()
  await expect(create).toBeDisabled()
  await expect(requirement).toBeVisible()

  // Without accounts the budget still works: the reset leaves the default categories.
  await tracker.openBudget()
  await expect(tracker.budgetSection.getByText(/Crea una cuenta/)).toHaveCount(0)

  await tracker.addAccount({ name: 'Cuenta inicial' })
  await tracker.openTransactions()
  await expect(create).toBeEnabled()
  await expect(requirement).toHaveCount(0)

  await tracker.openSettings()
  await tracker
    .section('settings')
    .getByRole('button', { name: 'Eliminar Cuenta inicial', exact: true })
    .click()
  await page
    .getByRole('alertdialog', { name: '¿Eliminar esta cuenta?' })
    .getByRole('button', { name: 'Eliminar cuenta', exact: true })
    .click()
  await tracker.openTransactions()
  await expect(create).toBeDisabled()
  await expect(requirement).toBeVisible()
})

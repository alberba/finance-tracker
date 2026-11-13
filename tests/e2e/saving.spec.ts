import { test, expect } from './fixtures'

test.describe('Ahorro E2E', () => {
  test(
    'registra un ahorro entre dos cuentas, lo persiste y lo muestra distinto de la inversión',
    { tag: '@smoke' },
    async ({ tracker }) => {
      await tracker.openSettingsTab('Categorías')
      const savings = tracker.categoryList('savingCategories')
      await savings.getByLabel('Nueva categoría de ahorro').fill('Hucha viaje')
      await savings.getByRole('button', { name: 'Añadir' }).click()
      await expect(tracker.categoryItem(savings, 'Hucha viaje')).toBeVisible()

      await tracker.openTransactions()
      await tracker.transactionsSection.getByRole('button', { name: 'Nuevo movimiento' }).click()
      const panel = tracker.transactionPanel
      await expect(panel.getByLabel('Cuenta destino')).toHaveCount(0)

      await panel
        .getByRole('group', { name: 'Tipo de movimiento' })
        .getByRole('button', { name: 'Ahorro', exact: true })
        .click()
      await panel.getByLabel('Cuenta origen').selectOption({ label: 'Revolut' })
      const destination = panel.getByLabel('Cuenta destino')
      await expect(destination.locator('option', { hasText: /^Revolut$/ })).toHaveCount(0)
      await destination.selectOption({ label: 'Revolut Ahorros' })
      await panel.getByLabel('Categoría').selectOption({ label: 'Hucha viaje' })
      await panel.getByLabel('Descripción').fill('Ahorro e2e')
      await panel.getByLabel('Importe').fill('120')
      await panel.getByRole('button', { name: 'Guardar movimiento' }).click()
      await expect(tracker.toast).toContainText('Movimiento guardado.')

      const row = tracker.transactionRows.filter({ hasText: 'Ahorro e2e' })
      await expect(row).toHaveCount(1)
      await expect(row).toContainText('Ahorro')
      await expect(row).not.toContainText('Inversión')

      await tracker.reload()
      await tracker.openTransactions()
      await expect(tracker.transactionRows.filter({ hasText: 'Ahorro e2e' })).toHaveCount(1)
    },
  )

  test('el dashboard suma ahorro e inversión en un solo indicador', async ({ tracker }) => {
    await tracker.openDashboard()
    await expect(tracker.kpi('investment').card.getByText('Ahorro e inversión')).toBeVisible()
  })

  test('crea un objetivo de ahorro que suma los ahorros anteriores de su categoría', async ({
    tracker,
  }) => {
    await tracker.openSettingsTab('Categorías')
    const savings = tracker.categoryList('savingCategories')
    await savings.getByLabel('Nueva categoría de ahorro').fill('Colchón')
    await savings.getByRole('button', { name: 'Añadir' }).click()
    await expect(tracker.categoryItem(savings, 'Colchón')).toBeVisible()

    await tracker.openTransactions()
    await tracker.transactionsSection.getByRole('button', { name: 'Nuevo movimiento' }).click()
    const movement = tracker.transactionPanel
    await movement
      .getByRole('group', { name: 'Tipo de movimiento' })
      .getByRole('button', { name: 'Ahorro', exact: true })
      .click()
    await movement.getByLabel('Cuenta origen').selectOption({ label: 'Revolut' })
    await movement.getByLabel('Cuenta destino').selectOption({ label: 'Revolut Ahorros' })
    await movement.getByLabel('Categoría').selectOption({ label: 'Colchón' })
    await movement.getByLabel('Descripción').fill('Ahorro previo')
    await movement.getByLabel('Importe').fill('120')
    await movement.getByRole('button', { name: 'Guardar movimiento' }).click()
    await expect(tracker.toast).toContainText('Movimiento guardado.')

    await tracker.openGoals()
    const goals = tracker.goalsSection
    await expect(tracker.savingGoalsEmpty).toBeVisible()
    await goals.getByRole('button', { name: 'Nuevo objetivo de ahorro' }).click()
    const panel = tracker.savingGoalPanel
    await panel.getByLabel('Nombre').fill('Fondo de emergencia')
    await panel.getByLabel('Importe objetivo').fill('3000')
    await panel.getByLabel('Categoría de ahorro').selectOption({ label: 'Colchón' })
    await panel.getByRole('button', { name: 'Guardar objetivo' }).click()

    const row = tracker.savingGoalRows
    await expect(row).toHaveCount(1)
    await expect(row).toContainText('Fondo de emergencia')
    await expect(row).toContainText('Colchón')
    // The saving made before the goal existed already counts towards it.
    await expect(row).toContainText('120,00')
    await expect(row).toContainText('4,00')
  })

  test('el presupuesto tiene el ahorro como cuarto tipo', async ({ tracker }) => {
    await tracker.openBudgetTab('saving')
    await expect(tracker.budgetTab('saving')).toHaveAttribute('aria-selected', 'true')
    await expect(tracker.budgetSection.getByRole('tab', { name: /^Ahorro/ })).toBeVisible()
  })
})

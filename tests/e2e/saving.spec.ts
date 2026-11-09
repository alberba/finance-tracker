import { test, expect } from './fixtures'

test.describe('Ahorro E2E', () => {
  test(
    'registra un ahorro entre dos cuentas, lo persiste y lo muestra distinto de la inversión',
    { tag: '@smoke' },
    async ({ tracker, page }) => {
      await tracker.openSettingsTab('Categorías')
      const savings = tracker.section('settings').locator('[data-category-list="savingCategories"]')
      await savings.getByLabel('Nueva categoría de ahorro').fill('Hucha viaje')
      await savings.getByRole('button', { name: 'Añadir' }).click()
      await expect(savings.locator('[data-category="Hucha viaje"]')).toBeVisible()

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
      await expect(page.locator('#toast')).toContainText('Movimiento guardado.')

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
    await expect(
      tracker.dashboardSection.locator('[data-kpi="investment"]').getByText('Ahorro e inversión'),
    ).toBeVisible()
  })

  test('el presupuesto tiene el ahorro como cuarto tipo', async ({ tracker }) => {
    await tracker.openBudgetTab('saving')
    const budget = tracker.budgetSection
    await expect(budget.locator('[data-budget-tab="saving"]')).toHaveAttribute(
      'aria-selected',
      'true',
    )
    await expect(budget.getByRole('tab', { name: /^Ahorro/ })).toBeVisible()
  })
})

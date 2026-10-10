import { test, expect, mirrorStateToServer } from './fixtures'

test('los requisitos bloquean solo las acciones afectadas y se resuelven al crear una cuenta', async ({
  page,
  tracker,
}) => {
  await tracker.goto()
  await page.evaluate(() => {
    const state = JSON.parse(localStorage.getItem('finance-tracker-state-v1')!)
    state.accounts = []
    state.investmentAssets = []
    state.liabilities = []
    state.transactions = []
    state.subscriptions = []
    state.recurringRules = []
    state.incomeCategories = ['Nómina']
    state.expenseCategories = []
    state.investmentCategories = []
    state.budget = { income: {}, expense: {}, investment: {} }
    state.onboardingCompleted = true
    state.onboardingPresented = true
    localStorage.setItem('finance-tracker-state-v1', JSON.stringify(state))
  })
  await mirrorStateToServer(page)
  await tracker.reload()

  await tracker.openTransactions()
  await expect(
    tracker.transactionsSection.getByRole('button', { name: 'Nuevo movimiento', exact: true }),
  ).toBeDisabled()
  await expect(
    tracker.transactionsSection.locator('[data-setup-requirement]').filter({ visible: true }),
  ).toContainText('Crea una cuenta')

  await tracker.openBudget()
  await expect(
    tracker.budgetSection.getByRole('button', { name: 'Editar categorías' }),
  ).toBeVisible()
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

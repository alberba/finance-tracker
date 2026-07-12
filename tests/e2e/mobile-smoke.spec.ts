import { test, expect } from './fixtures'

test.describe('Mobile smoke', () => {
  test('permite navegar entre dashboard, movimientos e inversión', async ({ page, tracker }) => {
    await expect(
      tracker.dashboardSection.getByRole('heading', {
        name: 'Resumen financiero',
      }),
    ).toBeVisible()

    await tracker.openTransactions()
    await expect(page).toHaveURL(/\/movimientos$/)
    await expect(
      tracker.transactionsSection.getByRole('heading', {
        name: 'Movimientos mensuales',
      }),
    ).toBeVisible()

    await tracker.openInvestment()
    await expect(page).toHaveURL(/\/inversion$/)
    await expect(
      tracker.section('investment').getByRole('heading', {
        name: 'Inversión y aportes',
      }),
    ).toBeVisible()
  })
})

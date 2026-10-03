import { test, expect } from './fixtures'
import { LiveMarketPage } from './pages/LiveMarketPage'

const RULE = {
  account: 'Revolut',
  category: 'Fondos Indexados',
  description: 'Compra mensual',
  amount: 300,
  frequency: 'monthly',
  startDate: '2026-12-01',
  symbol: 'VWCE',
  units: 1,
  unitPrice: 300,
}

test.describe('inversión · compras recurrentes', () => {
  test('crea una regla en el panel lateral y la muestra en el plan con su comprometido', async ({
    page,
    tracker,
  }) => {
    const liveMarket = new LiveMarketPage(page)
    await tracker.openInvestmentRecurringTab()
    await expect(liveMarket.recurringRules.locator('[data-ledger-empty]')).toBeVisible()

    await liveMarket.createRecurringRule({ ...RULE, frequency: 'weekly', amount: 25 })

    const row = liveMarket.recurringRules.locator('tr[data-recurring-rule-id]')
    await expect(row).toHaveCount(1)
    await expect(row).toContainText('Compra mensual')
    // 25 € a week is 25 × 52 ÷ 12 a month.
    await expect(liveMarket.recurringRules.locator('[data-recurring-summary]')).toContainText(
      '108,33 €',
    )
    await expect(liveMarket.recurringRules.locator('[data-recurring-monthly-total]')).toContainText(
      '108,33 €',
    )
  })

  test('edita una regla desde el plan', async ({ page, tracker }) => {
    const liveMarket = new LiveMarketPage(page)
    await tracker.openInvestmentRecurringTab()
    await liveMarket.createRecurringRule(RULE)

    await liveMarket.editFirstRecurringRule({ description: 'Compra VWCE', amount: 212.5 })

    const row = liveMarket.recurringRules.locator('tr[data-recurring-rule-id]')
    await expect(row).toContainText('Compra VWCE')
    await expect(row.locator('[data-recurring-amount]')).toHaveText('212,50 €')
  })

  test('pausa, reactiva y elimina una compra recurrente desde el plan', async ({
    page,
    tracker,
  }) => {
    const liveMarket = new LiveMarketPage(page)
    await tracker.openInvestmentRecurringTab()
    await liveMarket.createRecurringRule(RULE)

    const summary = liveMarket.recurringRules.locator('[data-recurring-summary]')
    await expect(summary).toContainText('300,00 €')

    const toggle = liveMarket.recurringRules.getByRole('switch', {
      name: 'Regla VWCE · Compra mensual activa',
    })
    await expect(toggle).toBeChecked()
    await toggle.uncheck({ force: true })
    await expect(toggle).not.toBeChecked()
    await expect(summary).not.toContainText('300,00 €')
    await expect(liveMarket.recurringRules.locator('tr[data-recurring-rule-id]')).toContainText(
      'Pausada',
    )

    await toggle.check({ force: true })
    await expect(toggle).toBeChecked()
    await expect(summary).toContainText('300,00 €')

    const row = liveMarket.recurringRules.locator('tr[data-recurring-rule-id]').first()
    const rowDelete = row.getByRole('button', { name: /^Eliminar la regla / })
    if (await rowDelete.isVisible()) {
      await rowDelete.click()
    } else {
      // Small screens hide the row actions: delete from the edit panel.
      await row.getByRole('button', { name: /^Editar la regla / }).click()
      await liveMarket.recurringPanel.getByRole('button', { name: 'Eliminar' }).click()
    }
    const dialog = page.getByRole('alertdialog', { name: '¿Eliminar esta regla?' })
    await expect(dialog).toBeVisible()
    await dialog.getByRole('button', { name: 'Eliminar regla' }).click()
    await expect(liveMarket.recurringRules.locator('tr[data-recurring-rule-id]')).toHaveCount(0)
  })
})

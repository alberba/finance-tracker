import type { State } from '../../src/scripts/types'
import { test, expect, mirrorStateToServer } from './fixtures'

test.describe('contribution defaults from wealth', () => {
  test.beforeEach(async ({ page, tracker }) => {
    await page.evaluate(() => {
      const state: State = JSON.parse(localStorage.getItem('finance-tracker-state-v1') || '{}')
      state.year = 2026
      state.accounts = [{ id: 'cash', name: 'MyInvestor', openingBalance: 1200 }]
      state.investmentAssets = [{ id: 'fund', name: 'Fund', openingBalance: 1000 }]
      state.liabilities = []
      state.twrLiquidityAccountIds = ['cash']
      state.transactions = []
      state.contributions = []
      state.snapshots = {
        1: { month: 1, investments: { fund: 0 }, accounts: {}, liabilities: {} },
      }
      localStorage.setItem('finance-tracker-state-v1', JSON.stringify(state))
    })
    await mirrorStateToServer(page)
    await tracker.reload()
  })

  test('prefills calculated balances and combines them with saved zero balances', async ({
    tracker,
    page,
  }) => {
    await tracker.openContributionWorkflowModal()
    await tracker.contributionWorkflowSelectMonth('ENERO')
    await expect(
      page.getByRole('spinbutton', { name: 'Snapshot inversión Fund', exact: true }),
    ).toHaveValue('1000')
    await expect(
      page.getByRole('spinbutton', { name: 'Snapshot liquidez MyInvestor', exact: true }),
    ).toHaveValue('1200')

    await tracker.contributionWorkflowSelectMonth('FEBRERO')
    await expect(
      page.getByRole('spinbutton', { name: 'Snapshot inversión Fund', exact: true }),
    ).toHaveValue('0')
    await expect(
      page.getByRole('spinbutton', { name: 'Snapshot liquidez MyInvestor', exact: true }),
    ).toHaveValue('1200')
  })

  test('keeps edited snapshot fields across month and date changes', async ({ tracker, page }) => {
    await tracker.openContributionWorkflowModal()
    await tracker.contributionWorkflowSelectMonth('ENERO')
    await tracker.contributionWorkflowSetInvestmentSnapshot('Fund', 1100)
    await tracker.contributionWorkflowSetLiquiditySnapshot('MyInvestor', 1400)
    await tracker.contributionWorkflowSelectMonth('FEBRERO')
    await tracker.contributionWorkflowSetDate('2026-03-15')
    await page.getByLabel('Fecha del aporte').press('Tab')

    await expect(
      page.getByRole('spinbutton', { name: 'Snapshot inversión Fund', exact: true }),
    ).toHaveValue('1100')
    await expect(
      page.getByRole('spinbutton', { name: 'Snapshot liquidez MyInvestor', exact: true }),
    ).toHaveValue('1400')
  })

  test('keeps edited allocations across date and month changes', async ({ tracker, page }) => {
    await tracker.openContributionWorkflowModal()
    await tracker.contributionWorkflowSelectMonth('ENERO')
    await tracker.contributionWorkflowGoToAllocationStep()
    await tracker.contributionWorkflowSetTotal(125)
    await tracker.contributionWorkflowSetAllocation('MyInvestor', 125)
    await tracker.contributionWorkflowSetDate('2026-03-15')
    await page.getByLabel('Fecha del aporte').press('Tab')
    await tracker.contributionWorkflowSelectMonth('ABRIL')

    await expect(page.getByRole('spinbutton', { name: 'Importe total del aporte' })).toHaveValue(
      '125',
    )
    await expect(
      page.getByRole('spinbutton', { name: 'Asignación aporte MyInvestor' }),
    ).toHaveValue('125')
  })

  test('opening, changing steps and cancelling does not save the form', async ({
    tracker,
    page,
  }) => {
    const before = await page.evaluate(() => {
      const state = JSON.parse(localStorage.getItem('finance-tracker-state-v1') || '{}')
      return { snapshots: state.snapshots, contributions: state.contributions }
    })
    await tracker.openContributionWorkflowModal()
    await tracker.contributionWorkflowSelectMonth('ENERO')
    await tracker.contributionWorkflowSetInvestmentSnapshot('Fund', 1100)
    await tracker.contributionWorkflowGoToAllocationStep()
    await tracker.contributionWorkflowSetTotal(125)
    await tracker.contributionWorkflowSetAllocation('MyInvestor', 125)
    await page.getByRole('button', { name: 'Anterior', exact: true }).click()
    await page.getByRole('button', { name: 'Cerrar recorrido' }).click()

    expect(
      await page.evaluate(() => {
        const state = JSON.parse(localStorage.getItem('finance-tracker-state-v1') || '{}')
        return { snapshots: state.snapshots, contributions: state.contributions }
      }),
    ).toEqual(before)
  })

  test('saving the prefilled balances adjusts wealth and survives reload', async ({
    tracker,
    page,
  }) => {
    await tracker.openContributionWorkflowModal()
    await tracker.contributionWorkflowSelectMonth('ENERO')
    await tracker.contributionWorkflowSetDate('2026-01-15')
    await tracker.contributionWorkflowGoToAllocationStep()
    await tracker.contributionWorkflowSetTotal(100)
    await tracker.contributionWorkflowSetAllocation('MyInvestor', 100)
    const persisted = page.waitForResponse((response) => {
      if (!response.url().includes('/api/state') || response.request().method() !== 'PUT')
        return false
      const state = response.request().postDataJSON()?.state
      return state?.snapshots?.['0']?.accounts?.cash === 1300
    })
    await tracker.contributionWorkflowSave()
    await persisted
    await tracker.reload()
    await tracker.openWealth()
    await tracker.wealthSection.getByLabel('Mes snapshot').selectOption({ label: 'ENERO' })
    await expect(
      tracker.wealthSection.getByRole('spinbutton', { name: 'Snapshot de MyInvestor' }),
    ).toHaveValue('1300')
    await expect(
      tracker.wealthSection.getByRole('spinbutton', { name: 'Snapshot de Fund' }),
    ).toHaveValue('1000')

    await tracker.openContributionWorkflowModal()
    await tracker.contributionWorkflowSelectMonth('ENERO')
    await tracker.contributionWorkflowSetDate('2026-01-15')
    await expect(
      page.getByRole('spinbutton', { name: 'Snapshot liquidez MyInvestor', exact: true }),
    ).toHaveValue('1300')
  })
})

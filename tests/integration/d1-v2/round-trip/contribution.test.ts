// @vitest-environment happy-dom
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'

import { useFinancialStateStore } from '../../../../src/stores/financial-state'
import { useInvestmentStore } from '../../../../src/stores/investment'
import { useSettingsStore } from '../../../../src/stores/settings'
import { useWealthStore } from '../../../../src/stores/wealth'
import { startRoundTrip, type RoundTrip } from './harness'

describe('round trip: contribution wealth adjustment', () => {
  let trip: RoundTrip
  let cashId: string
  let otherId: string
  let fundId: string
  let liabilityId: string
  let date: string

  beforeEach(async () => {
    trip = await startRoundTrip()
    const settings = useSettingsStore()
    settings.addEntity('accounts', 'MyInvestor', '1200')
    settings.addEntity('accounts', 'Other', '300')
    settings.addEntity('investmentAssets', 'Fund', '1000')
    settings.addEntity('liabilities', 'Loan', '50')
    const state = await trip.reload()
    cashId = state.accounts[0].id
    otherId = state.accounts[1].id
    fundId = state.investmentAssets[0].id
    liabilityId = state.liabilities[0].id
    date = `${state.year}-04-15`
    useSettingsStore().toggleTwrLiquidity(cashId, true)
    useSettingsStore().toggleTwrLiquidity(otherId, true)
    const wealth = useWealthStore()
    wealth.setMonth(3)
    wealth.saveSnapshot([
      { kind: 'accounts', id: otherId, value: '300' },
      { kind: 'liabilities', id: liabilityId, value: '50' },
    ])
    await trip.reload()
  })

  afterEach(() => trip.cleanup())

  function save(amount: number, accountId = cashId): void {
    const investment = useInvestmentStore()
    const workflow = investment.buildWorkflowState(3, date)
    expect(
      investment.saveContribution(
        date,
        3,
        [
          ...workflow.investments.map((item) => ({
            kind: 'investments' as const,
            id: item.id,
            value: item.value,
          })),
          ...workflow.liquidity.map((item) => ({
            kind: 'accounts' as const,
            id: item.id,
            value: item.value,
          })),
        ],
        [{ accountId, amount }],
        [],
      ),
    ).toBe(true)
  }

  it('persists the adjusted snapshot with the contribution and preserves other balances', async () => {
    save(100)

    const state = await trip.reload()

    expect(state.snapshots['3']).toEqual({
      month: 3,
      accounts: { [cashId]: 1300, [otherId]: 300 },
      investments: { [fundId]: 1000 },
      liabilities: { [liabilityId]: 50 },
    })
    expect(state.contributions).toHaveLength(1)
    expect(state.contributions[0]).toMatchObject({
      portfolioValue: 2500,
      flow: 100,
      flowAllocations: [{ accountId: cashId, amount: 100 }],
    })
    expect(useFinancialStateStore().state.snapshots['3'].accounts[cashId]).toBe(1300)
  })

  it('keeps the adjustment after an offline restart and later confirmation', async () => {
    trip.setOffline(true)
    save(100)

    const offline = await trip.reloadOffline()
    expect(offline.snapshots['3'].accounts[cashId]).toBe(1300)
    expect(offline.contributions[0].portfolioValue).toBe(2500)

    trip.setOffline(false)
    const confirmed = await trip.reload()
    expect(confirmed.snapshots['3']).toEqual(offline.snapshots['3'])
    expect(confirmed.contributions[0].flowAllocations).toEqual([{ accountId: cashId, amount: 100 }])
    expect(await trip.pending()).toEqual([])
  })

  it('preserves the allocation and balance of an account created offline', async () => {
    trip.setOffline(true)
    useSettingsStore().addEntity('accounts', 'New cash', '400')
    const newAccountId = useFinancialStateStore().accounts.find(
      (account) => account.name === 'New cash',
    )!.id
    await vi.waitFor(async () => expect(await trip.pending()).toHaveLength(1))
    useSettingsStore().toggleTwrLiquidity(newAccountId, true)
    save(100, newAccountId)

    const offline = await trip.reloadOffline()
    expect(offline.snapshots['3'].accounts[newAccountId]).toBe(500)
    expect(offline.contributions[0].flowAllocations).toEqual([
      { accountId: newAccountId, amount: 100 },
    ])

    trip.setOffline(false)
    const confirmed = await trip.reload()
    expect(confirmed.snapshots['3'].accounts[newAccountId]).toBe(500)
    expect(confirmed.contributions[0].flowAllocations).toEqual([
      { accountId: newAccountId, amount: 100 },
    ])
    expect(confirmed.twrLiquidityAccountIds).toContain(newAccountId)
  })

  it.each([
    { name: 'repeated save', amount: 100, reassign: false, cash: 1300, other: 300 },
    { name: 'amount edit', amount: 150, reassign: false, cash: 1350, other: 300 },
    { name: 'reassignment', amount: 150, reassign: true, cash: 1200, other: 450 },
  ])('persists $name without duplicating the flow', async ({ amount, reassign, cash, other }) => {
    save(100)
    await trip.reload()
    save(amount, reassign ? otherId : cashId)

    const state = await trip.reload()
    expect(state.snapshots['3'].accounts).toEqual({ [cashId]: cash, [otherId]: other })
    expect(state.contributions).toHaveLength(1)
    expect(state.contributions[0]).toMatchObject({ portfolioValue: 2500, flow: amount })
  })
})

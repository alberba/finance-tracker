import { mount } from '@vue/test-utils'
import { createPinia, setActivePinia } from 'pinia'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { nextTick, type Component } from 'vue'

import SetupRequirement from '../../src/components/onboarding/SetupRequirement.vue'
import TransactionPanel from '../../src/components/transactions/TransactionPanel.vue'
import SubscriptionPanel from '../../src/components/transactions/SubscriptionPanel.vue'
import SettingsRecurringRulePanel from '../../src/components/settings/SettingsRecurringRulePanel.vue'
import InvestmentMovementPanel from '../../src/components/investment/InvestmentMovementPanel.vue'
import InvestmentRecurringRulePanel from '../../src/components/investment/InvestmentRecurringRulePanel.vue'
import SettingsRecurringTab from '../../src/components/settings/SettingsRecurringTab.vue'
import InvestmentMovementsTab from '../../src/components/investment/InvestmentMovementsTab.vue'
import InvestmentRecurringTab from '../../src/components/investment/InvestmentRecurringTab.vue'
import TransactionsSection from '../../src/components/sections/TransactionsSection.vue'
import DashboardSection from '../../src/components/sections/DashboardSection.vue'
import BudgetPlanPanel from '../../src/components/budget/BudgetPlanPanel.vue'
import { useBudgetStore } from '../../src/stores/budget'
import BudgetSection from '../../src/components/sections/BudgetSection.vue'
import WealthSection from '../../src/components/sections/WealthSection.vue'
import { useFinancialStateStore } from '../../src/stores/financial-state'
import { useUiStore } from '../../src/stores/ui'

vi.mock('../../src/composables/useSetupNavigation', () => ({
  useSetupNavigation: () => ({ createAccount: vi.fn(), editCategories: vi.fn() }),
}))

const account = { id: 'cash', name: 'Efectivo', openingBalance: 0 }
const wrappers: { unmount(): void }[] = []
function render(component: Component, shallow = false) {
  const wrapper = mount(component, {
    shallow,
    props: { isActive: true },
    global: {
      stubs: { SetupRequirement: false, BaseButton: false, AppSection: false, PageHeader: false },
    },
  })
  wrappers.push(wrapper)
  return wrapper
}

beforeEach(() => {
  setActivePinia(createPinia())
  useFinancialStateStore().patchState((draft) => {
    draft.accounts = []
    draft.investmentAssets = []
    draft.liabilities = []
  })
})
afterEach(() => {
  wrappers.splice(0).forEach((wrapper) => wrapper.unmount())
})

const panels = [
  { name: 'TransactionPanel', component: TransactionPanel },
  { name: 'SubscriptionPanel', component: SubscriptionPanel },
  { name: 'SettingsRecurringRulePanel', component: SettingsRecurringRulePanel },
  { name: 'InvestmentMovementPanel', component: InvestmentMovementPanel },
  { name: 'InvestmentRecurringRulePanel', component: InvestmentRecurringRulePanel },
]

describe('account requirements', () => {
  it.each(panels)('blocks exposed creation in $name without accounts', async ({ component }) => {
    const wrapper = render(component)
    wrapper.vm.openNew()
    await nextTick()
    expect(wrapper.get('dialog').attributes('open')).toBeUndefined()
    expect(wrapper.get('button[type="submit"]').attributes('disabled')).toBeDefined()
  })

  it.each(panels)('reacts to account creation and removal in $name', async ({ component }) => {
    const store = useFinancialStateStore()
    const wrapper = render(component)
    store.patchState((draft) => {
      draft.accounts = [account]
    })
    await nextTick()
    wrapper.vm.openNew()
    await nextTick()
    await nextTick()
    expect(wrapper.get('dialog').attributes('open')).toBeDefined()
    expect(wrapper.findComponent(SetupRequirement).exists()).toBe(false)
    store.patchState((draft) => {
      draft.accounts = []
    })
    await nextTick()
    expect(wrapper.findComponent(SetupRequirement).exists()).toBe(true)
    expect(wrapper.get('button[type="submit"]').attributes('disabled')).toBeDefined()
    const before = JSON.stringify(store.state)
    await wrapper.get('form').trigger('submit')
    expect(JSON.stringify(store.state)).toBe(before)
  })

  it.each([
    { name: 'TransactionsSection', component: TransactionsSection },
    { name: 'DashboardSection', component: DashboardSection },
    { name: 'SettingsRecurringTab', component: SettingsRecurringTab },
    { name: 'InvestmentMovementsTab', component: InvestmentMovementsTab },
    { name: 'InvestmentRecurringTab', component: InvestmentRecurringTab },
  ])('shows and clears the creation requirement reactively in $name', async ({ component }) => {
    const store = useFinancialStateStore()
    const wrapper = render(component, true)
    expect(wrapper.findComponent(SetupRequirement).exists()).toBe(true)
    store.patchState((draft) => {
      draft.accounts = [account]
    })
    await nextTick()
    expect(wrapper.findComponent(SetupRequirement).exists()).toBe(false)
    store.patchState((draft) => {
      draft.accounts = []
    })
    await nextTick()
    expect(wrapper.findComponent(SetupRequirement).exists()).toBe(true)
  })

  it('consumes a pending movement action once the panel mounts', async () => {
    useFinancialStateStore().patchState((draft) => {
      draft.accounts = [account]
    })
    const ui = useUiStore()
    ui.setupAction = 'movement'
    const wrapper = render(TransactionsSection)
    await nextTick()
    await nextTick()
    expect(ui.setupAction).toBeNull()
    expect(wrapper.findComponent(TransactionPanel).get('dialog').attributes('open')).toBeDefined()
  })
})

describe('budget requirements', () => {
  it('blocks saving an open plan when its category is deleted', async () => {
    const store = useFinancialStateStore()
    store.patchState((draft) => {
      draft.incomeCategories = ['Nómina']
    })
    const budget = useBudgetStore()
    const save = vi.spyOn(budget, 'saveBudgetPlan')
    const wrapper = render(BudgetSection)
    await wrapper.get('button[role=tab][data-budget-tab=income]').trigger('click')
    await wrapper.get('button[aria-label="Planificar los doce meses de Nómina"]').trigger('click')
    const panel = wrapper.findComponent(BudgetPlanPanel)
    store.patchState((draft) => {
      draft.incomeCategories = []
    })
    await nextTick()
    expect(panel.findComponent(SetupRequirement).exists()).toBe(true)
    expect(panel.get('button[type=submit]').attributes('disabled')).toBeDefined()
    await panel.get('form').trigger('submit')
    expect(save).not.toHaveBeenCalled()
  })

  it('uses only categories of the selected type and permits planning without accounts', async () => {
    const store = useFinancialStateStore()
    store.patchState((draft) => {
      draft.expenseCategories = []
      draft.incomeCategories = ['Nómina']
      draft.investmentCategories = []
    })
    const wrapper = render(BudgetSection)
    expect(wrapper.get('[data-setup-requirement] button').text()).toBe('Editar categorías')
    await wrapper.get('button[role="tab"][data-budget-tab="income"]').trigger('click')
    expect(wrapper.findComponent(SetupRequirement).exists()).toBe(false)
    expect(wrapper.find('[data-budget-summary]').exists()).toBe(true)
    store.patchState((draft) => {
      draft.incomeCategories = []
    })
    await nextTick()
    expect(wrapper.findComponent(SetupRequirement).exists()).toBe(true)
  })
})

describe('wealth requirements', () => {
  it.each(['accounts', 'investmentAssets', 'liabilities'] as const)(
    'accepts %s alone and disables saving when the last entity disappears',
    async (key) => {
      const store = useFinancialStateStore()
      const wrapper = render(WealthSection, true)
      expect(wrapper.findComponent(SetupRequirement).exists()).toBe(true)
      const save = wrapper.get('[data-save-snapshot]')
      expect(save.attributes('disabled')).toBeDefined()
      store.patchState((draft) => {
        draft[key] = [account]
      })
      await nextTick()
      expect(wrapper.findComponent(SetupRequirement).exists()).toBe(false)
      expect(save.attributes('disabled')).toBeUndefined()
      store.patchState((draft) => {
        draft[key] = []
      })
      await nextTick()
      expect(save.attributes('disabled')).toBeDefined()
    },
  )
})

import { defineStore } from 'pinia'
import { reactive } from 'vue'

import type { UiState } from '../scripts/app/ui-state'
import type { SectionId } from '../scripts/types'

function currentMonth(): number {
  return Math.min(new Date().getMonth(), 11)
}

function createDefaultUiState(): UiState {
  const month = currentMonth()

  return {
    activeSection: 'dashboard',
    month,
    budgetType: 'income',
    budgetMonth: month,
    txFilterMonth: month,
    txSort: { column: 'date', direction: 'desc' },
    txOpenHeaderFilter: '',
    txSelectedIds: [],
    txFilters: {
      date: '',
      accountIds: [],
      types: [],
      category: '',
      description: '',
      amountMin: '',
      amountMax: '',
    },
    txEditingId: '',
    snapshotMonth: month,
    investmentMonth: month,
    wealthCalcTargetId: '',
    wealthCalcTargetName: '',
    investmentTab: 'dashboard',
    investmentTxEditingId: '',
    investmentYearFilter: new Date().getFullYear(),
    investmentOnlyUndeclared: false,
    investmentReturnMode: 'simple',
    contributionWorkflowStep: 1,
    contributionWorkflowMonth: month,
    contributionWorkflowDate: '',
    contributionWorkflowAmount: 0,
    contributionCalcTargetKind: '',
    contributionCalcTargetId: '',
    contributionCalcTargetName: '',
  }
}

export const useUiStore = defineStore('ui', () => {
  const ui = reactive<UiState>(createDefaultUiState())

  function setActiveSection(sectionId: SectionId): void {
    ui.activeSection = sectionId
  }

  function setDashboardMonth(month: number): void {
    ui.month = month
  }

  function replaceUiState(nextUi: UiState): void {
    Object.assign(ui, nextUi)
  }

  return {
    ui,
    setActiveSection,
    setDashboardMonth,
    replaceUiState,
  }
})

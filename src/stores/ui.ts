import { defineStore } from 'pinia'
import { reactive, ref } from 'vue'

import { monthFromDate, type Month } from '../lib/month'
import type { UiState } from '../scripts/app/ui-state'
import type { SectionId } from '../scripts/types'

function currentMonth(): Month {
  return monthFromDate(new Date())
}

function createDefaultUiState(): UiState {
  const month = currentMonth()

  return {
    activeSection: 'dashboard',
    month,
    txYear: new Date().getFullYear(),
    txFilterMonth: month,
    txSort: { column: 'date', direction: 'desc' },
    txSelectedIds: [],
    txFilters: {
      search: '',
      types: [],
      accountIds: [],
      date: '',
      amountMin: '',
      amountMax: '',
    },
    txTab: 'registry',
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
  const settingsTab = ref('accounts')
  const setupAction = ref<'account' | 'movement' | null>(null)

  function setActiveSection(sectionId: SectionId): void {
    ui.activeSection = sectionId
  }

  function setDashboardMonth(month: Month): void {
    ui.month = month
  }

  function replaceUiState(nextUi: UiState): void {
    Object.assign(ui, nextUi)
  }

  return {
    ui,
    settingsTab,
    setupAction,
    setActiveSection,
    setDashboardMonth,
    replaceUiState,
  }
})

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
    txYear: new Date().getFullYear(),
    txFilterMonth: month,
    txSort: { column: 'date', direction: 'desc' },
    txSelectedIds: [],
    txFilters: {
      search: '',
      types: [],
      accountIds: [],
    },
    txTab: 'registry',
    snapshotMonth: month,
    investmentMonth: month,
    investmentReturnMode: 'simple',
  }
}

export const useUiStore = defineStore('ui', () => {
  const ui = reactive<UiState>(createDefaultUiState())
  /** Página montada por el shell: una sección normal o «Mis reportes» (#340). */
  const page = ref<'section' | 'reports'>('section')
  const settingsTab = ref('accounts')
  const setupAction = ref<'account' | 'movement' | null>(null)

  function setActiveSection(sectionId: SectionId): void {
    ui.activeSection = sectionId
  }

  function setPage(nextPage: 'section' | 'reports'): void {
    page.value = nextPage
  }

  function replaceUiState(nextUi: UiState): void {
    Object.assign(ui, nextUi)
  }

  return {
    ui,
    page,
    settingsTab,
    setupAction,
    setActiveSection,
    setPage,
    replaceUiState,
  }
})

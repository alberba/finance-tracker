import { defineStore } from 'pinia'
import { reactive, ref } from 'vue'

import type { Month } from '../../../lib/month'
import type { StartMode } from './prepare-view-model'

// Presentation state of Presupuesto (#433): which of its four screens
// is showing, and what the user finished this session from the cover's
// entries, so «Revisar septiembre» reads «Septiembre revisado» with its undo.
// Nothing here is persisted: the plans themselves go through the budget store.

export type BudgetScreen = 'month' | 'review' | 'prepare' | 'year'

export interface ReviewOutcome {
  /** The closed month that was reviewed. */
  month: Month
  /** «Cambios aplicados a octubre–diciembre». */
  summary: string
  /** Puts the plans back as they were before applying. */
  undo: () => void
}

export interface PrepareOutcome {
  /** The month that was prepared. */
  month: Month
  /** «Guardado para noviembre y diciembre». */
  summary: string
}

function emptyPrepareDraft() {
  return {
    chosenStart: null as StartMode | null,
    edited: {} as Record<string, number>,
    drafts: {} as Record<string, string>,
    repeat: false,
    confirmation: '',
  }
}

export const useNeonBudgetScreens = defineStore('neon-budget-screens', () => {
  const screen = ref<BudgetScreen>('month')
  const reviewed = ref<ReviewOutcome | null>(null)
  const prepared = ref<PrepareOutcome | null>(null)
  const prepareDraft = reactive(emptyPrepareDraft())
  let preparePeriod = ''

  function setPreparePeriod(year: number, month: Month | null): void {
    const period = `${year}-${month}`
    if (preparePeriod === period) return
    preparePeriod = period
    Object.assign(prepareDraft, emptyPrepareDraft())
  }

  function go(next: BudgetScreen): void {
    if (screen.value === 'prepare' && next !== 'prepare') {
      Object.assign(prepareDraft, emptyPrepareDraft())
    }
    screen.value = next
  }

  return { screen, reviewed, prepared, prepareDraft, setPreparePeriod, go }
})

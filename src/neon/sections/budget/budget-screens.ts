import { defineStore } from 'pinia'
import { ref } from 'vue'

import type { Month } from '../../../lib/month'

// Presentation state of the new Presupuesto (#433): which of its four screens
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

export const useNeonBudgetScreens = defineStore('neon-budget-screens', () => {
  const screen = ref<BudgetScreen>('month')
  const reviewed = ref<ReviewOutcome | null>(null)
  const prepared = ref<PrepareOutcome | null>(null)

  function go(next: BudgetScreen): void {
    screen.value = next
  }

  return { screen, reviewed, prepared, go }
})

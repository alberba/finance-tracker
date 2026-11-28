import { computed, reactive } from 'vue'

import { formatMonthName } from '../../../lib/format'
import { useBudgetStore } from '../../../stores/budget'
import { useNeonBudgetScreens } from './budget-screens'
import {
  applyPlan,
  applyRange,
  defaultDraft,
  reviewCategories,
  reviewChanges,
  reviewPosition,
  reviewStrip,
  reviewTotals,
  type Decision,
  type DecisionMode,
  type ReviewCategory,
} from './review-view-model'

/**
 * The state of «Revisar {mes}»: the closed month category by category, the
 * decision taken on each and what «Aplicar» writes. The desktop screen and the
 * mobile one both read it, so they decide and apply by the same rules.
 */
export function useReviewSession() {
  const budgetStore = useBudgetStore()
  const screens = useNeonBudgetScreens()

  const position = computed(() => reviewPosition(budgetStore.viewModel))
  const rows = computed(() => budgetStore.viewModel.types.expense.rows)
  const categories = computed(() =>
    position.value ? reviewCategories(rows.value, position.value) : [],
  )
  const monthName = computed(() => (position.value ? formatMonthName(position.value.closed) : ''))
  const monthLower = computed(() => monthName.value.toLowerCase())
  const from = computed(() => position.value?.applyFrom ?? null)

  const decisions = reactive<Record<string, Decision | undefined>>({})
  const totals = computed(() => reviewTotals(categories.value, decisions))
  const changes = computed(() => reviewChanges(categories.value, decisions))
  const strip = computed(() =>
    position.value ? reviewStrip(categories.value, position.value.closed) : [],
  )
  const applied = computed(
    () => !!position.value && screens.reviewed?.month === position.value.closed,
  )
  const canApply = computed(() => from.value !== null && changes.value.length > 0 && !applied.value)
  /** Categories whose suggestion is a change; the rest are «en orden». */
  const exceptions = computed(() =>
    categories.value.filter((category) => category.suggestion.mode !== 'keep'),
  )
  const inOrder = computed(() =>
    categories.value.filter((category) => category.suggestion.mode === 'keep'),
  )

  function pick(category: ReviewCategory, mode: DecisionMode): void {
    decisions[category.category] = { mode, draft: defaultDraft(category, mode) }
  }

  function draftOf(category: ReviewCategory): string {
    return decisions[category.category]?.draft ?? ''
  }

  function setDraft(category: ReviewCategory, value: string): void {
    const current = decisions[category.category]
    if (current) current.draft = value
  }

  function modeOf(category: ReviewCategory): DecisionMode | undefined {
    return decisions[category.category]?.mode
  }

  /** Takes a decision back, to decide again. */
  function reopen(category: ReviewCategory): void {
    decisions[category.category] = undefined
  }

  function isPressed(category: ReviewCategory, mode: DecisionMode): boolean {
    return modeOf(category) === mode
  }

  function showAmount(category: ReviewCategory): boolean {
    const mode = modeOf(category)
    return mode === 'up' || mode === 'down'
  }

  function apply(): void {
    const start = from.value
    const current = position.value
    if (!start || !current || !canApply.value) return
    const writes = applyPlan(rows.value, changes.value, start)
    for (const write of writes) {
      budgetStore.saveBudgetPlan('expense', write.category, write.after, { notify: false })
    }
    screens.reviewed = {
      month: current.closed,
      summary: `Cambios aplicados a ${applyRange(start)}`,
      undo() {
        for (const write of writes) {
          budgetStore.saveBudgetPlan('expense', write.category, write.before, { notify: false })
        }
        screens.reviewed = null
      },
    }
  }

  /** Takes every suggestion as it is, and applies the result. */
  function acceptAll(): void {
    for (const category of exceptions.value) pick(category, category.suggestion.mode)
    apply()
  }

  function undo(): void {
    screens.reviewed?.undo()
  }

  return {
    position,
    rows,
    categories,
    exceptions,
    inOrder,
    monthName,
    monthLower,
    from,
    decisions,
    totals,
    changes,
    strip,
    applied,
    canApply,
    pick,
    draftOf,
    setDraft,
    modeOf,
    reopen,
    isPressed,
    showAmount,
    apply,
    acceptAll,
    undo,
  }
}

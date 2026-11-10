import { storeToRefs } from 'pinia'
import { computed, ref } from 'vue'

import { useMoneyFormatter } from '../../../composables/useMoneyFormatter'
import { formatMonthName } from '../../../lib/format'
import { asMonth } from '../../../lib/month'
import { useBudgetStore } from '../../../stores/budget'
import { useFinancialStateStore } from '../../../stores/financial-state'
import { useNeonBudgetScreens } from './budget-screens'
import {
  categoryDetail,
  monthCategories,
  monthHero,
  monthPosition,
  spendChart,
  unbudgetedCategories,
} from './month-view-model'

export const ICON_REVIEW = 'M9 11l3 3 8-8M20 12v7a1 1 0 0 1-1 1H5a1 1 0 0 1-1-1V5a1 1 0 0 1 1-1h11'
export const ICON_PREPARE = 'M4 6h16v14H4zM4 10h16M8 3v4M16 3v4M9 15h6'

export interface Entry {
  key: string
  kicker: string
  title: string
  teaser: string
  done: boolean
  open: () => void
  undo?: () => void
  undoLabel?: string
}

/**
 * The cover of Presupuesto, «Este mes»: where the month stands, the two things
 * to do (review the closed month, prepare the next) and the category whose
 * detail is open. The desktop cover and the mobile one both read it.
 */
export function useMonthCover() {
  const budgetStore = useBudgetStore()
  const financialStateStore = useFinancialStateStore()
  const screens = useNeonBudgetScreens()
  const { reviewed, prepared } = storeToRefs(screens)
  const { viewModel } = storeToRefs(budgetStore)
  const { formatMoney } = useMoneyFormatter()

  const position = computed(() => monthPosition(viewModel.value, new Date()))
  const expenseRows = computed(() => viewModel.value.types.expense.rows)
  const categories = computed(() => monthCategories(expenseRows.value, position.value))
  const unbudgeted = computed(() => unbudgetedCategories(expenseRows.value, position.value))
  const hero = computed(() => monthHero(categories.value, position.value))
  const chart = computed(() => spendChart(financialStateStore.state.transactions, position.value))
  const monthName = computed(() => formatMonthName(position.value.month).toLowerCase())

  // The month just closed exists from February on; the next month, until November.
  const entries = computed<Entry[]>(() => {
    const current = viewModel.value.currentMonth
    const list: Entry[] = []
    const closed = current >= 2 && current <= 12 ? asMonth(current - 1) : null
    if (closed) {
      const name = formatMonthName(closed)
      const done = reviewed.value?.month === closed ? reviewed.value : null
      list.push({
        key: 'review',
        kicker: done ? 'Hecho' : `Pendiente · cierre de ${name.toLowerCase()}`,
        title: done ? `${name} revisado` : `Revisar ${name.toLowerCase()}`,
        teaser: done?.summary ?? '',
        done: !!done,
        open: () => screens.go('review'),
        undo: done?.undo,
        undoLabel: `Deshacer la revisión de ${name.toLowerCase()}`,
      })
    }
    const next = current >= 1 && current <= 11 ? asMonth(current + 1) : null
    if (next) {
      const name = formatMonthName(next)
      const done = prepared.value?.month === next ? prepared.value : null
      list.push({
        key: 'prepare',
        kicker: done ? 'Hecho' : '',
        title: done ? `${name} preparado` : `Preparar ${name.toLowerCase()}`,
        teaser: done ? `${done.summary} · ver` : '',
        done: !!done,
        open: () => screens.go('prepare'),
      })
    }
    return list
  })

  // The panel keeps the last category while it slides out.
  const openCategory = ref<string | null>(null)
  const shownCategory = ref<string | null>(null)
  const detailOpen = computed({
    get: () => openCategory.value !== null,
    set: (open) => {
      if (!open) openCategory.value = null
    },
  })

  function showCategory(category: string): void {
    openCategory.value = shownCategory.value = category
  }

  const detail = computed(() => {
    const row = expenseRows.value.find((candidate) => candidate.category === shownCategory.value)
    return row ? categoryDetail(row, position.value) : null
  })

  return {
    viewModel,
    position,
    expenseRows,
    categories,
    unbudgeted,
    hero,
    chart,
    monthName,
    entries,
    openCategory,
    detailOpen,
    showCategory,
    detail,
    formatMoney,
    screens,
  }
}

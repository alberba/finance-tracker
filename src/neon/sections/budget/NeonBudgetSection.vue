<script setup lang="ts">
import { useBudgetStore } from '../../../stores/budget'
import { useFinancialStateStore } from '../../../stores/financial-state'
import { useScreenDiagnostic } from '../../reports/use-report-diagnostic'
import { monthPosition } from './month-view-model'
import { prepareTarget } from './prepare-view-model'
import { reviewPosition } from './review-view-model'
import { storeToRefs } from 'pinia'
import { nextTick, watch } from 'vue'

import { useMediaQuery } from '../../../composables/useMediaQuery'
import { FRAME_QUERY } from '../../ui/sheet-drag'
import { diagnoseBudget } from './budget-diagnostic'
import { useNeonBudgetScreens } from './budget-screens'
import NeonBudgetMonth from './NeonBudgetMonth.vue'
import NeonBudgetMonthMobile from './NeonBudgetMonthMobile.vue'
import NeonBudgetPrepare from './NeonBudgetPrepare.vue'
import NeonBudgetPrepareMobile from './NeonBudgetPrepareMobile.vue'
import NeonBudgetReview from './NeonBudgetReview.vue'
import NeonBudgetReviewMobile from './NeonBudgetReviewMobile.vue'
import NeonBudgetYear from './NeonBudgetYear.vue'
import NeonBudgetYearMobile from './NeonBudgetYearMobile.vue'

// Presupuesto (artboard «Presupuesto · 2560 px», #433): one
// section with a cover, «Este mes», and three screens it opens: the review of
// the month just closed, the plan of the next one and the whole year. Each
// screen brings its own header; this only switches between them and moves
// focus to the new title so a keyboard or screen-reader user lands on it. The
// mobile frame gets its own composition of each screen (artboard «Presupuesto
// · móvil · Pixel 10», #434) over the same state; which one shows follows the
// frame's media query, as in the dashboard.
const props = withDefaults(defineProps<{ isActive?: boolean }>(), { isActive: false })

const screens = useNeonBudgetScreens()
const { screen } = storeToRefs(screens)
const desktopFrame = useMediaQuery(FRAME_QUERY)
const budget = useBudgetStore()
const financial = useFinancialStateStore()
useScreenDiagnostic('budget', () => {
  const view = budget.viewModel
  const subview = screen.value
  if (subview === 'year') return undefined
  const month = {
    month: () => monthPosition(view, new Date()).month,
    review: () => reviewPosition(view)?.closed,
    prepare: () => prepareTarget(view) ?? undefined,
  }[subview]()
  if (month === undefined) return { subview, year: view.year, checks: ['insufficient'] }
  return diagnoseBudget(view, financial.transactions, {
    subview,
    months: [month],
    type: subview === 'month' ? 'expense' : undefined,
  })
})

watch(screen, async () => {
  window.scrollTo?.({ top: 0 })
  await nextTick()
  if (props.isActive) document.getElementById('budget-title')?.focus({ preventScroll: true })
})
</script>

<template>
  <section
    v-show="isActive"
    id="budget"
    class="@container grid min-w-0 content-start gap-5"
    aria-labelledby="budget-title"
  >
    <template v-if="desktopFrame">
      <NeonBudgetMonth v-if="screen === 'month'" />
      <NeonBudgetReview v-else-if="screen === 'review'" />
      <NeonBudgetPrepare v-else-if="screen === 'prepare'" />
      <NeonBudgetYear v-else />
    </template>
    <template v-else>
      <NeonBudgetMonthMobile v-if="screen === 'month'" />
      <NeonBudgetReviewMobile v-else-if="screen === 'review'" />
      <NeonBudgetPrepareMobile v-else-if="screen === 'prepare'" />
      <NeonBudgetYearMobile v-else />
    </template>
  </section>
</template>

<script setup lang="ts">
import { storeToRefs } from 'pinia'
import { nextTick, watch } from 'vue'

import { useNeonBudgetScreens } from './budget-screens'
import NeonBudgetMonth from './NeonBudgetMonth.vue'
import NeonBudgetPrepare from './NeonBudgetPrepare.vue'
import NeonBudgetReview from './NeonBudgetReview.vue'
import NeonBudgetYear from './NeonBudgetYear.vue'

// Presupuesto in the new design (artboard «Presupuesto · 2560 px», #433): one
// section with a cover, «Este mes», and three screens it opens: the review of
// the month just closed, the plan of the next one and the whole year. Each
// screen brings its own header; this only switches between them and moves
// focus to the new title so a keyboard or screen-reader user lands on it.
const props = withDefaults(defineProps<{ isActive?: boolean }>(), { isActive: false })

const screens = useNeonBudgetScreens()
const { screen } = storeToRefs(screens)

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
    <NeonBudgetMonth v-if="screen === 'month'" />
    <NeonBudgetReview v-else-if="screen === 'review'" />
    <NeonBudgetPrepare v-else-if="screen === 'prepare'" />
    <NeonBudgetYear v-else />
  </section>
</template>

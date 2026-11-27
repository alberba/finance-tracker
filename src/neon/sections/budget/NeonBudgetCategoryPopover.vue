<script setup lang="ts">
import { useTemplateRef } from 'vue'

import NeonRowPopover from '../../ui/NeonRowPopover.vue'
import NeonBudgetCategoryChart from './NeonBudgetCategoryChart.vue'
import type { CategoryDetail } from './month-view-model'

// One expense category month by month on the desktop, in a popover beside its
// row of «Por categoría». The phone shows the same chart in a bottom sheet.
defineProps<{
  detail: CategoryDetail | null
  year: number
  /** The row it belongs to. */
  anchor: HTMLElement | null
}>()

const open = defineModel<boolean>('open', { required: true })
const chart = useTemplateRef<InstanceType<typeof NeonBudgetCategoryChart>>('chart')
</script>

<template>
  <NeonRowPopover
    v-if="detail"
    v-model:open="open"
    :title="detail.category"
    :anchor="anchor"
    rows="[data-budget-category]"
    data-budget-detail
    @opened="chart?.focusChosen()"
  >
    <NeonBudgetCategoryChart ref="chart" :detail="detail" :year="year" :bars-height="160" />
  </NeonRowPopover>
</template>

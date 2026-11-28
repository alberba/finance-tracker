<script setup lang="ts">
import NeonDetailPanel from '../../ui/NeonDetailPanel.vue'
import NeonBudgetCategoryChart from './NeonBudgetCategoryChart.vue'
import type { CategoryDetail } from './month-view-model'

// One expense category month by month, as a bottom sheet on the phone (the
// desktop shows the same chart in a popover beside the row).
defineProps<{ detail: CategoryDetail | null; year: number }>()

const open = defineModel<boolean>('open', { required: true })
</script>

<template>
  <NeonDetailPanel v-model:open="open" :title="detail?.category ?? ''">
    <NeonBudgetCategoryChart v-if="detail" :detail="detail" :year="year" />
  </NeonDetailPanel>
</template>

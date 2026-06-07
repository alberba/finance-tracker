<script setup lang="ts">
import type { DashboardTopExpenseItem } from '../../scripts/app/dashboard-view-model'
import ProgressBar from './ProgressBar.vue'

defineProps<{
  items: DashboardTopExpenseItem[]
}>()
</script>

<template>
  <div class="flex min-h-0 flex-col justify-between gap-3">
    <p v-if="!items.length" class="dash-empty py-2 text-sm text-(--text-faint)">
      Sin gastos en este mes.
    </p>
    <div v-for="item in items" :key="item.category" class="grid gap-1">
      <div class="flex items-center justify-between text-(--text-main)">
        <div class="flex items-center gap-2">
          {{ item.emoji }}
          <span class="font-semibold">
            {{ item.category }}
          </span>
        </div>
        <div class="flex items-center gap-1">
          <strong class="font-['DM_Mono',monospace] text-xs font-medium">
            {{ item.amount }}
          </strong>
          <small class="text-xs text-(--text-faint)">{{ item.pct }}</small>
        </div>
      </div>
      <ProgressBar :value="item.pctValue" />
    </div>
  </div>
</template>

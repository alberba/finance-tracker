<script setup lang="ts">
import { computed } from 'vue'

import type { InvestmentProgressItem } from '../../scripts/app/dashboard-investment-progress-list'
import ProgressBar from './ProgressBar.vue'

const props = defineProps<{
  items: InvestmentProgressItem[]
}>()

const hasItems = computed(() => props.items.length > 0)

function progressLabel(progress: number): string {
  return progress.toFixed(0)
}
</script>

<template>
  <p v-if="!hasItems" class="dash-empty py-2 text-sm text-text-faint">
    Sin inversión registrada en este mes.
  </p>
  <template v-else>
    <article v-for="item in props.items" :key="item.category" data-investment-progress-item>
      <div class="grid min-w-0 gap-1">
        <div class="flex items-center gap-3">
          {{ item.icon }}
          <div class="flex w-full justify-between">
            <span
              class="overflow-hidden text-[0.9rem] leading-[1.2] font-semibold text-ellipsis whitespace-nowrap text-text-main"
            >
              {{ item.category }}
            </span>
            <small class="font-['DM_Mono',monospace] text-text-muted">
              {{ item.actual }}/{{ item.plannedLabel }}({{ progressLabel(item.progress) }}%)
            </small>
          </div>
        </div>
        <ProgressBar :value="item.progress" />
      </div>
    </article>
  </template>
</template>

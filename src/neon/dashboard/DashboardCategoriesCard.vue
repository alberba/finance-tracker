<script setup lang="ts">
import type { SectionId } from '../../scripts/types'
import NeonCard from '../ui/NeonCard.vue'
import NeonEmptyState from '../ui/NeonEmptyState.vue'
import NeonProgressBar from '../ui/NeonProgressBar.vue'
import type { NeonDashboardViewModel } from './view-model'

// Gasto por categoría: what each category spent against its monthly limit.
// The bar is neutral; it only turns to loss when the category goes over.
defineProps<{ categories: NeonDashboardViewModel['categories'] }>()
const emit = defineEmits<{ navigate: [section: SectionId] }>()
</script>

<template>
  <NeonCard
    title="Gasto por categoría"
    title-id="dashboard-categories-title"
    :to="{ section: 'budget', label: 'Ir a Presupuesto' }"
    data-dashboard-categories
    @navigate="emit('navigate', $event)"
  >
    <NeonEmptyState v-if="!categories.length">
      Aún no hay gastos ni límites este mes.
    </NeonEmptyState>
    <ul v-else>
      <li
        v-for="item in categories"
        :key="item.category"
        class="border-line flex min-h-16 flex-col gap-1.75 border-t py-2.5"
      >
        <div class="flex items-baseline justify-between gap-3">
          <span class="font-bold">{{ item.category }}</span>
          <span class="text-muted text-meta whitespace-nowrap">
            <b :class="item.over ? 'text-loss' : 'text-text'">{{ item.spent }}</b>
            {{ item.limit ? `/ ${item.limit}` : '· sin límite' }}
          </span>
        </div>
        <NeonProgressBar v-if="item.limit" :value="item.width" :over="item.over" />
      </li>
    </ul>
  </NeonCard>
</template>

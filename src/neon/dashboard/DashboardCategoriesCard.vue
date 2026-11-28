<script setup lang="ts">
import type { SectionId } from '../../scripts/types'
import NeonCard from '../ui/NeonCard.vue'
import NeonEmptyState from '../ui/NeonEmptyState.vue'
import NeonFitList from '../ui/NeonFitList.vue'
import NeonProgressBar from '../ui/NeonProgressBar.vue'
import { barDelay, rowDelay } from '../ui/row-motion'
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
    <NeonFitList v-else>
      <li
        v-for="(item, index) in categories"
        :key="item.category"
        class="border-line motion-safe:animate-row border-t"
        :style="{ animationDelay: `${rowDelay(index)}ms` }"
      >
        <button
          type="button"
          class="outline-accent rounded-field hover:bg-panel2 -mx-3 flex min-h-16 w-[calc(100%+1.5rem)] cursor-pointer flex-col gap-1.75 px-3 py-2.5 text-start focus-visible:outline-2 focus-visible:-outline-offset-2 motion-safe:transition-[background-color,transform] motion-safe:duration-160 motion-safe:ease-out motion-safe:active:scale-[0.985]"
          @click="emit('navigate', 'budget')"
        >
          <div class="flex items-baseline justify-between gap-3">
            <span class="font-bold">{{ item.category }}</span>
            <span class="text-muted text-meta whitespace-nowrap">
              <b
                class="font-display text-figure-row font-semibold"
                :class="item.over ? 'text-loss' : 'text-text'"
                >{{ item.spent }}</b
              >
              {{ item.limit ? `de ${item.limit}` : '· sin límite' }}
            </span>
          </div>
          <NeonProgressBar
            v-if="item.limit"
            :value="item.width"
            :over="item.over"
            :delay="barDelay(index)"
          />
        </button>
      </li>
    </NeonFitList>
  </NeonCard>
</template>

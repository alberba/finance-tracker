<script setup lang="ts">
import { ref } from 'vue'

import { useMediaQuery } from '../../../composables/useMediaQuery'
import NeonDetailPanel from '../../ui/NeonDetailPanel.vue'
import { FRAME_QUERY } from '../../ui/sheet-drag'
import NeonRegistryBreakdown from './NeonRegistryBreakdown.vue'
import type { Breakdown, FilterSummary } from './registry-view-model'

// «Resumen del filtro»: the month the registry starts from, with arrows to
// move it, the figure of what the filters leave in that month and its split
// by category (neutral bars, DESIGN.md «Barra de progreso»).
//
// On the mobile frame the summary leads the ledger, so it stays short: the
// split hides behind a row with its title that opens it in a bottom sheet.
defineProps<{
  monthTitle: string
  isLatestMonth: boolean
  summary: FilterSummary
  breakdown: Breakdown
}>()

const emit = defineEmits<{ step: [delta: -1 | 1] }>()

const desktopFrame = useMediaQuery(FRAME_QUERY)
const breakdownOpen = ref(false)

const arrowClass =
  'border-ctrl-line text-text outline-accent grid size-11 place-items-center rounded-full border focus-visible:outline-2 focus-visible:outline-offset-2 aria-disabled:opacity-40 motion-safe:transition-transform motion-safe:duration-140 motion-safe:active:scale-[0.97]'
</script>

<template>
  <aside
    aria-label="Resumen del filtro"
    class="bg-panel border-line rounded-card grid gap-5 self-start border px-3 py-4 @min-[560px]/registry:px-6 @min-[560px]/registry:py-[22px]"
    data-registry-aside
  >
    <div class="flex items-center justify-between gap-2">
      <button type="button" :class="arrowClass" aria-label="Mes anterior" @click="emit('step', -1)">
        <svg
          class="size-5"
          viewBox="0 0 24 24"
          fill="none"
          stroke="currentColor"
          stroke-width="2"
          stroke-linecap="round"
          stroke-linejoin="round"
          aria-hidden="true"
        >
          <path d="M15 6l-6 6 6 6" />
        </svg>
      </button>
      <h2 class="text-[18px] font-extrabold" aria-live="polite" data-registry-month>
        {{ monthTitle }}
      </h2>
      <button
        type="button"
        :class="arrowClass"
        aria-label="Mes siguiente"
        :aria-disabled="isLatestMonth"
        @click="!isLatestMonth && emit('step', 1)"
      >
        <svg
          class="size-5"
          viewBox="0 0 24 24"
          fill="none"
          stroke="currentColor"
          stroke-width="2"
          stroke-linecap="round"
          stroke-linejoin="round"
          aria-hidden="true"
        >
          <path d="M9 6l6 6-6 6" />
        </svg>
      </button>
    </div>
    <div class="grid gap-2">
      <p class="text-muted text-[14px] font-bold">{{ summary.label }}</p>
      <p
        class="font-display text-[clamp(34px,3.4cqi,44px)] leading-none font-semibold tracking-[-0.04em] whitespace-nowrap tabular-nums"
        data-registry-total
      >
        {{ summary.total }}
      </p>
      <p class="text-soft text-[15px]">{{ summary.count }}</p>
    </div>
    <div v-if="desktopFrame" class="border-line grid gap-3.5 border-t pbs-[18px]">
      <h3 class="text-[18px] font-extrabold">{{ breakdown.title }}</h3>
      <NeonRegistryBreakdown :breakdown="breakdown" />
    </div>
    <template v-else>
      <button
        type="button"
        class="border-line text-text outline-accent -mbe-2 flex min-h-12 items-center justify-between gap-3 border-t pbs-2 text-start text-[16px] font-extrabold focus-visible:outline-2 focus-visible:outline-offset-2"
        aria-haspopup="dialog"
        @click="breakdownOpen = true"
      >
        {{ breakdown.title }}
        <svg
          class="text-muted size-[18px] shrink-0"
          viewBox="0 0 24 24"
          fill="none"
          stroke="currentColor"
          stroke-width="2"
          stroke-linecap="round"
          stroke-linejoin="round"
          aria-hidden="true"
        >
          <path d="M9 6l6 6-6 6" />
        </svg>
      </button>
      <NeonDetailPanel v-model:open="breakdownOpen" :title="breakdown.title" :kicker="monthTitle">
        <NeonRegistryBreakdown :breakdown="breakdown" />
      </NeonDetailPanel>
    </template>
  </aside>
</template>

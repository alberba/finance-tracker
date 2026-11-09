<script setup lang="ts">
import type { SectionId } from '../../scripts/types'
import NeonCard from '../ui/NeonCard.vue'
import NeonEmptyState from '../ui/NeonEmptyState.vue'
import NeonLineChart from '../ui/NeonLineChart.vue'
import { useQuotesNote } from './quotes-note'
import type { NeonDashboardViewModel } from './view-model'

// Inversiones: the portfolio's value and total gain, how it is split and how
// it went this year. Quotes are never shown as real time: the note says when
// they were taken, or that they are late.
defineProps<{ investments: NeonDashboardViewModel['investments'] }>()
const emit = defineEmits<{ navigate: [section: SectionId] }>()

const quotes = useQuotesNote()

const SWATCHES = ['bg-lilac', 'bg-lilac2', 'bg-peach', 'bg-lilac3', 'bg-neutral-bar'] as const
const TONE_TEXT = { gain: 'text-gain', loss: 'text-loss', neutral: 'text-text' } as const
</script>

<template>
  <NeonCard
    title="Inversiones"
    title-id="dashboard-investments-title"
    :to="{ section: 'investment', label: 'Ir a Inversión' }"
    data-dashboard-investments
    @navigate="emit('navigate', $event)"
  >
    <NeonEmptyState v-if="investments.empty">
      Aún no tienes inversiones. Apunta una compra para empezar a seguir tu cartera.
    </NeonEmptyState>
    <template v-else>
      <div class="flex flex-col gap-1.5">
        <span
          class="font-display text-figure-block text-text font-semibold whitespace-nowrap tabular-nums"
        >
          {{ investments.value }}
        </span>
        <span v-if="investments.gain" class="text-muted text-note">
          Ganancia total
          <b class="font-extrabold" :class="TONE_TEXT[investments.gain.tone]">{{
            investments.gain.text
          }}</b>
        </span>
        <span
          v-if="quotes"
          class="text-meta inline-flex items-center gap-1.5"
          :class="quotes.late ? 'text-soft' : 'text-muted'"
        >
          <svg
            class="size-3.5"
            viewBox="0 0 24 24"
            fill="none"
            stroke="currentColor"
            stroke-width="2"
            stroke-linecap="round"
            stroke-linejoin="round"
            aria-hidden="true"
          >
            <circle cx="12" cy="12" r="9" />
            <path d="M12 7v5l3 2" />
          </svg>
          {{ quotes.text }}
        </span>
      </div>
      <div
        v-if="investments.positions.length"
        role="img"
        :aria-label="`Reparto de la cartera: ${investments.positions.map((p) => `${p.name} ${p.share}`).join(', ')}`"
        class="rounded-pill flex h-1.5 gap-0.75 overflow-hidden"
      >
        <span
          v-for="(position, index) in investments.positions"
          :key="position.name"
          :class="SWATCHES[index % SWATCHES.length]"
          :style="{ flex: `${position.weight} 1 0px` }"
        />
      </div>
      <ul class="text-muted text-meta -mt-1 flex flex-wrap gap-x-3.5 gap-y-1" aria-hidden="true">
        <li
          v-for="(position, index) in investments.positions"
          :key="position.name"
          class="inline-flex items-center gap-1.5"
        >
          <span class="size-2 rounded-xs" :class="SWATCHES[index % SWATCHES.length]" />
          {{ position.name }} {{ position.share }}
        </li>
      </ul>
      <NeonLineChart v-if="investments.chart.line" :chart="investments.chart" tone="lilac" />
    </template>
  </NeonCard>
</template>

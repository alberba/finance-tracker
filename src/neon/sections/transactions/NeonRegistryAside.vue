<script setup lang="ts">
import type { Breakdown, FilterSummary } from './registry-view-model'

// «Resumen del filtro»: the month the registry starts from, with arrows to
// move it, the figure of what the filters leave in that month and its split
// by category (neutral bars, DESIGN.md «Barra de progreso»).
defineProps<{
  monthTitle: string
  isLatestMonth: boolean
  summary: FilterSummary
  breakdown: Breakdown
}>()

const emit = defineEmits<{ step: [delta: -1 | 1] }>()

const arrowClass =
  'border-ctrl-line text-text outline-accent grid size-11 place-items-center rounded-full border focus-visible:outline-2 focus-visible:outline-offset-2 aria-disabled:opacity-40 motion-safe:transition-transform motion-safe:duration-140 motion-safe:active:scale-[0.97]'
</script>

<template>
  <aside
    aria-label="Resumen del filtro"
    class="bg-panel border-line rounded-card grid gap-5 self-start border px-6 py-[22px]"
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
    <div class="border-line grid gap-3.5 border-t pbs-[18px]">
      <h3 class="text-[18px] font-extrabold">{{ breakdown.title }}</h3>
      <ul v-if="breakdown.rows.length" class="grid gap-3.5" data-tx-breakdown>
        <li v-for="row in breakdown.rows" :key="row.name" class="grid min-w-0 gap-[7px]">
          <div class="flex min-w-0 items-baseline justify-between gap-3 text-[15px]">
            <span class="min-w-0 truncate font-semibold">{{ row.name }}</span>
            <span class="font-bold whitespace-nowrap tabular-nums">
              {{ row.amount }}
              <span class="text-muted text-[13px] font-semibold">{{ row.share }}</span>
            </span>
          </div>
          <div class="bg-line rounded-pill h-1.5 overflow-hidden" aria-hidden="true">
            <span
              class="bg-neutral-bar rounded-pill block h-full"
              :style="{ width: `${row.width}%` }"
            ></span>
          </div>
        </li>
      </ul>
      <p v-else class="text-muted text-[14px]">Nada que sumar con estos filtros.</p>
    </div>
  </aside>
</template>

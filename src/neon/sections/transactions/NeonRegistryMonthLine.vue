<script setup lang="ts">
import type { FilterSummary } from './registry-view-model'

// The month of the registry on the mobile frame (artboard «Movimientos ·
// móvil»): the month the ledger starts from, centered between its arrows, and
// one line with what the filters leave in it, the figure in bold. The desktop
// aside's split by category does not come along. The registry's actions
// (select, export) sit under it, to the right.
defineProps<{
  monthTitle: string
  isLatestMonth: boolean
  summary: FilterSummary
}>()

const emit = defineEmits<{ step: [delta: -1 | 1] }>()

const arrowClass =
  'border-ctrl-line text-text outline-accent grid size-11 place-items-center rounded-full border focus-visible:outline-2 focus-visible:outline-offset-2 aria-disabled:opacity-40 motion-safe:transition-transform motion-safe:duration-140 motion-safe:active:scale-[0.97]'
</script>

<template>
  <section aria-label="Resumen del filtro" class="grid gap-3" data-registry-aside>
    <div class="flex items-center justify-center gap-5">
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
    <p class="text-soft text-center text-[15px]">
      {{ summary.count }} ·
      <span
        class="font-display text-text font-semibold whitespace-nowrap tabular-nums"
        data-registry-total
        >{{ summary.total }}</span
      >
    </p>
    <div class="flex justify-end gap-2">
      <slot name="actions" />
    </div>
  </section>
</template>

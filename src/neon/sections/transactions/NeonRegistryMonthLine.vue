<script setup lang="ts">
import { computed, ref, useTemplateRef } from 'vue'

import type { Month } from '../../../lib/month'
import NeonButton from '../../ui/NeonButton.vue'
import NeonDetailPanel from '../../ui/NeonDetailPanel.vue'
import type { MonthCell } from './registry-view-model'

// The month of the registry on the phone (DESIGN.md, «Movimientos en móvil»):
// one line with the month and its count on the left and the figure large on
// the right, as the page's summary. The month opens a sheet with the twelve
// months of the year and each one's figure, so a month in the red shows
// before going into it; the year moves with its arrows. «Exportar» lives at
// the foot of that sheet.
const props = defineProps<{
  monthTitle: string
  count: string
  total: string
  year: number
  months: readonly MonthCell[]
  selected: Month
  hasPreviousYear: boolean
  hasNextYear: boolean
  /** The figure is the net (every type shows), not the plain total of one type. */
  isNet: boolean
}>()

const emit = defineEmits<{ pick: [month: Month]; year: [delta: -1 | 1]; export: [] }>()

const open = ref(false)
const trigger = useTemplateRef<HTMLButtonElement>('trigger')

// «+524,87 €» as «+524» large and «,87 €» small, so the count beside it keeps
// one line.
function split(text: string): { whole: string; rest: string } {
  const match = /^(.*?)(,\d+.*)$/.exec(text)
  return match ? { whole: match[1], rest: match[2] } : { whole: text, rest: '' }
}
const figure = computed(() => split(props.total))

function pick(month: Month): void {
  open.value = false
  emit('pick', month)
}

function exportPeriod(): void {
  open.value = false
  emit('export')
}

const yearArrow =
  'border-ctrl-line text-text outline-accent grid size-11 place-items-center rounded-full border focus-visible:outline-2 focus-visible:outline-offset-2 disabled:opacity-40 motion-safe:transition-transform motion-safe:duration-160 motion-safe:ease-out motion-safe:enabled:active:scale-[0.97]'
</script>

<template>
  <section
    aria-label="Resumen del filtro"
    class="flex items-center justify-between gap-3"
    data-registry-aside
  >
    <button
      ref="trigger"
      type="button"
      class="outline-accent -m-1 grid min-h-11 min-w-0 justify-items-start rounded-[14px] p-1 text-start focus-visible:outline-2 focus-visible:outline-offset-2 motion-safe:transition-transform motion-safe:duration-160 motion-safe:ease-out motion-safe:active:scale-[0.97]"
      aria-haspopup="dialog"
      :aria-expanded="open"
      @click="open = true"
    >
      <span class="inline-flex items-center gap-1.5 text-[18px] font-extrabold">
        <span aria-live="polite" data-registry-month>{{ monthTitle }}</span>
        <svg
          class="text-muted size-4 shrink-0"
          viewBox="0 0 24 24"
          fill="none"
          stroke="currentColor"
          stroke-width="2.5"
          stroke-linecap="round"
          stroke-linejoin="round"
          aria-hidden="true"
        >
          <path d="m6 9 6 6 6-6" />
        </svg>
        <span class="sr-only">, elegir otro mes</span>
      </span>
      <span class="text-muted truncate text-[13px]">{{ count }}</span>
    </button>
    <span
      class="font-display text-text text-[26px] font-semibold tracking-[-0.03em] whitespace-nowrap tabular-nums"
      data-registry-total
      >{{ figure.whole }}<span class="text-muted text-[16px]">{{ figure.rest }}</span></span
    >
  </section>

  <NeonDetailPanel v-model:open="open" title="Elegir mes" :return-focus="trigger">
    <div class="grid gap-3.5">
      <div class="flex items-center justify-between gap-3">
        <button
          type="button"
          :class="yearArrow"
          aria-label="Año anterior"
          :disabled="!hasPreviousYear"
          @click="emit('year', -1)"
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
            <path d="M15 6l-6 6 6 6" />
          </svg>
        </button>
        <p class="font-display text-[20px] font-semibold tabular-nums" aria-live="polite">
          {{ year }}
        </p>
        <button
          type="button"
          :class="yearArrow"
          aria-label="Año siguiente"
          :disabled="!hasNextYear"
          @click="emit('year', 1)"
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
      <ul class="grid grid-cols-3 gap-1.5" aria-label="Meses">
        <li v-for="cell in months" :key="cell.month" class="grid">
          <button
            type="button"
            class="outline-accent grid min-h-16 justify-items-start gap-0.5 rounded-[14px] px-3 py-2.5 text-start focus-visible:outline-2 focus-visible:outline-offset-2 disabled:cursor-default motion-safe:transition-transform motion-safe:duration-160 motion-safe:ease-out motion-safe:enabled:active:scale-[0.97]"
            :class="
              cell.future
                ? 'border-line text-faint border border-dashed'
                : cell.month === selected
                  ? 'bg-sel-bg text-sel-text'
                  : 'bg-panel2 text-text'
            "
            :disabled="cell.future"
            :aria-current="cell.month === selected ? 'date' : undefined"
            @click="pick(cell.month)"
          >
            <span class="text-[14px] font-extrabold">{{ cell.name }}</span>
            <span
              v-if="!cell.future"
              class="font-display text-[13px] font-semibold whitespace-nowrap tabular-nums"
              :class="cell.negative && cell.month !== selected && 'text-loss'"
              >{{ split(cell.total).whole
              }}<span class="opacity-70">{{ split(cell.total).rest }}</span></span
            >
          </button>
        </li>
      </ul>
      <p class="text-muted text-[13px]">
        {{
          isNet
            ? 'Neto de cada mes con los filtros de ahora: lo que entró menos lo que salió.'
            : 'Total de cada mes con los filtros de ahora.'
        }}
      </p>
    </div>
    <template #footer>
      <NeonButton @click="exportPeriod">Exportar</NeonButton>
    </template>
  </NeonDetailPanel>
</template>

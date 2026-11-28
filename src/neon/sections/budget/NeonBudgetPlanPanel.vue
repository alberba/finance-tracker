<script setup lang="ts">
import { computed, ref, watch } from 'vue'

import { type BudgetRow } from '../../../domain/budget/view-model'
import { ALL_MONTHS, atMonth, monthIndex } from '../../../lib/month'
import { formatDecimalInput } from '../../../lib/number'
import type { BudgetType } from '../../../scripts/types'
import NeonButton from '../../ui/NeonButton.vue'
import NeonDetailPanel from '../../ui/NeonDetailPanel.vue'
import {
  editLabel,
  monthName,
  parseDraft,
  planFigures,
  planKicker,
  planReference,
} from './year-view-model'

// The year plan of one category in a detail panel: the twelve months at once,
// each with what was recorded beside it. Saving commits the whole plan.
const props = defineProps<{
  type: BudgetType
  row: BudgetRow | null
  year: number
  currentMonth: number
}>()
const emit = defineEmits<{ save: [plan: number[]] }>()

const open = defineModel<boolean>('open', { required: true })

const FORM_ID = 'budget-plan-form'
const drafts = ref<string[]>([])

// A row opened again (or edited elsewhere) starts from its saved plan.
watch(
  () => [open.value, props.row] as const,
  ([isOpen, row]) => {
    if (isOpen && row) drafts.value = row.cells.map((cell) => formatDecimalInput(cell.planned))
  },
  { immediate: true },
)

const values = computed(() => drafts.value.map(parseDraft))
const invalid = computed(() => values.value.map((value) => value === null))
const valid = computed(() => !!props.row && !invalid.value.some(Boolean))
const figures = computed(() =>
  props.row ? planFigures(props.type, props.row, drafts.value, props.currentMonth) : null,
)

const TONE_TEXT = { gain: 'text-gain', loss: 'text-loss' } as const

function save(): void {
  if (!valid.value) return
  emit(
    'save',
    values.value.map((value) => value ?? 0),
  )
}
</script>

<template>
  <NeonDetailPanel
    v-model:open="open"
    :title="row?.category ?? ''"
    :kicker="planKicker(year, type)"
  >
    <template v-if="row && figures">
      <dl
        class="border-line divide-line grid grid-cols-3 divide-x border-y py-3"
        aria-label="Cifras del plan"
        data-budget-plan-figures
      >
        <div class="grid min-w-0 gap-0.5 pe-3">
          <dt class="text-muted text-meta">Presupuestado</dt>
          <dd class="font-display truncate text-[16px] font-semibold tabular-nums">
            {{ figures.planned }}
          </dd>
        </div>
        <div class="grid min-w-0 gap-0.5 px-3">
          <dt class="text-muted text-meta">Real hasta hoy</dt>
          <dd class="font-display truncate text-[16px] font-semibold tabular-nums">
            {{ figures.actual }}
          </dd>
        </div>
        <div class="grid min-w-0 gap-0.5 ps-3">
          <dt class="text-muted text-meta">{{ figures.deviationLabel }}</dt>
          <dd
            class="font-display truncate text-[16px] font-semibold tabular-nums"
            :class="figures.tone ? TONE_TEXT[figures.tone] : 'text-text'"
          >
            {{ figures.deviation }}
          </dd>
        </div>
      </dl>

      <p class="text-muted text-[14px]">
        Lo real viene de tus movimientos. Cambia el importe de cada mes y guarda.
      </p>

      <form :id="FORM_ID" autocomplete="off" @submit.prevent="save">
        <ul>
          <li
            v-for="month in ALL_MONTHS"
            :key="month"
            class="border-line grid min-h-[58px] grid-cols-[minmax(0,1fr)_132px] items-center gap-3 border-t"
          >
            <span class="grid min-w-0">
              <span class="text-[16px] font-bold" aria-hidden="true">{{
                monthName(month).charAt(0).toUpperCase() + monthName(month).slice(1)
              }}</span>
              <span :id="`budget-plan-ref-${month}`" class="text-muted text-meta truncate">{{
                planReference(atMonth(row.cells, month))
              }}</span>
            </span>
            <span class="flex items-center gap-1.5">
              <input
                v-model="drafts[monthIndex(month)]"
                type="text"
                inputmode="decimal"
                :aria-label="editLabel(row.category, month)"
                :aria-describedby="`budget-plan-ref-${month}`"
                :aria-invalid="atMonth(invalid, month)"
                class="border-ctrl-line bg-panel text-text font-display rounded-field outline-accent aria-invalid:border-loss min-h-[46px] w-full min-w-0 border px-3.5 text-right text-[15px] font-semibold tabular-nums focus-visible:outline-2 focus-visible:outline-offset-2"
              />
              <span class="text-muted text-[14px]" aria-hidden="true">€</span>
            </span>
          </li>
        </ul>
      </form>
    </template>

    <template #footer>
      <NeonButton @click="open = false">Cancelar</NeonButton>
      <NeonButton variant="primary" type="submit" :form="FORM_ID" :disabled="!valid">
        Guardar plan
      </NeonButton>
    </template>
  </NeonDetailPanel>
</template>

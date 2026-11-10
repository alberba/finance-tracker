<script setup lang="ts">
import { ref } from 'vue'

import type { Month } from '../../../lib/month'
import type { BudgetType } from '../../../scripts/types'
import NeonBudgetPlanEditor from './NeonBudgetPlanEditor.vue'
import NeonBudgetYearBar from './NeonBudgetYearBar.vue'
import {
  monthAria,
  PAST_LABEL,
  remainingHead,
  saveLabel,
  whole,
  type MonthList,
} from './year-view-model'

// «Mes» of «El año»: one row per category with what was recorded, its bar, the
// plan (a click turns it into a field) and what is left or over.
const props = defineProps<{ type: BudgetType; month: Month; list: MonthList }>()
const emit = defineEmits<{
  plan: [category: string]
  update: [category: string, month: Month, value: number]
}>()

const editing = ref<string | null>(null)

function save(category: string, value: number): void {
  editing.value = null
  emit('update', category, props.month, value)
}

// Same columns in the header, every row and the total.
const COLUMNS =
  'grid grid-cols-[minmax(190px,250px)_150px_minmax(0,1fr)_190px_180px] items-center gap-x-6'

const TONE_TEXT = { gain: 'text-gain', loss: 'text-loss' } as const

function toneClass(tone: 'gain' | 'loss' | null): string {
  return tone ? TONE_TEXT[tone] : 'text-text'
}
</script>

<template>
  <section
    :aria-label="monthAria(type, month)"
    class="bg-panel border-line rounded-card grid min-w-0 gap-4 overflow-x-auto border px-6 py-[22px]"
    data-budget-month
  >
    <p class="text-muted text-[14px]">
      Ordenadas por lo cerca que están del presupuesto. Haz clic en el presupuesto para cambiarlo.
    </p>
    <div class="min-w-[900px]">
      <div
        :class="COLUMNS"
        class="text-muted text-label tracking-label pbe-4 font-extrabold uppercase"
        aria-hidden="true"
      >
        <span>Categoría</span>
        <span>{{ PAST_LABEL[type] }}</span>
        <span>Cumplimiento</span>
        <span>Presupuesto</span>
        <span class="text-right">{{ remainingHead(type) }}</span>
      </div>
      <ul>
        <li
          v-for="line in list.lines"
          :key="line.category"
          :class="COLUMNS"
          class="border-line min-h-[68px] border-t"
        >
          <button
            type="button"
            class="text-text outline-accent min-h-10 min-w-0 truncate text-left text-[16px] font-bold focus-visible:outline-2 focus-visible:outline-offset-2"
            :aria-label="`Plan de ${line.category} para el año`"
            @click="emit('plan', line.category)"
          >
            {{ line.category }}
          </button>
          <span
            class="font-display text-[16px] font-semibold tabular-nums"
            :class="line.actual === null ? 'text-muted' : toneClass(line.tone)"
            >{{ line.actual === null ? '—' : whole(line.actual) }}</span
          >
          <NeonBudgetYearBar :bar="line.bar" :excess="type === 'income' ? 'gain' : 'loss'" large />
          <span class="min-w-0">
            <NeonBudgetPlanEditor
              v-if="editing === line.category"
              wide
              :plan="line.plan"
              :label="line.editLabel"
              :save-label="saveLabel(line.category, month)"
              @save="(value) => save(line.category, value)"
              @cancel="editing = null"
            />
            <button
              v-else
              type="button"
              class="text-muted outline-accent min-h-8 cursor-text text-[15px] font-semibold underline underline-offset-4 focus-visible:outline-2 focus-visible:outline-offset-2"
              :aria-label="line.editLabel"
              @click="editing = line.category"
            >
              de {{ whole(line.plan) }} €
            </button>
          </span>
          <span
            class="text-right text-[15px] font-bold whitespace-nowrap"
            :class="toneClass(line.remainingTone)"
            >{{ line.remaining }}</span
          >
        </li>
        <li :class="COLUMNS" class="border-grid min-h-[68px] border-t">
          <span class="text-[16px] font-extrabold">Total</span>
          <span
            class="font-display text-[16px] font-bold tabular-nums"
            :class="list.total.actual === null ? 'text-muted' : toneClass(list.total.tone)"
            >{{ list.total.actual === null ? '—' : whole(list.total.actual) }}</span
          >
          <NeonBudgetYearBar
            :bar="list.total.bar"
            :excess="type === 'income' ? 'gain' : 'loss'"
            large
          />
          <span class="text-muted text-[15px] font-semibold"
            >de {{ whole(list.total.plan) }} €</span
          >
          <span
            class="text-right text-[15px] font-extrabold whitespace-nowrap"
            :class="toneClass(list.total.remainingTone)"
            >{{ list.total.remaining }}</span
          >
        </li>
      </ul>
    </div>
  </section>
</template>

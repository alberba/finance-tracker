<script setup lang="ts">
import { storeToRefs } from 'pinia'
import { computed, useTemplateRef } from 'vue'

import GoalEditPanel from '../goals/GoalEditPanel.vue'
import GoalLedger from '../goals/GoalLedger.vue'
import SavingGoalPanel from '../goals/SavingGoalPanel.vue'
import SavingGoalsBlock from '../goals/SavingGoalsBlock.vue'
import { dueLabel, portfolioPaceSentence } from '../goals/goal-text'
import AllocationBar from '../ui/AllocationBar.vue'
import AppSection from '../ui/AppSection.vue'
import DocumentSurface from '../ui/DocumentSurface.vue'
import InkBand from '../ui/InkBand.vue'
import NumberedBlock from '../ui/NumberedBlock.vue'
import PageHeader from '../ui/PageHeader.vue'
import { useMoneyFormatter } from '../../composables/useMoneyFormatter'
import type { GoalPace, GoalRowViewModel } from '../../domain/goals/view-model'
import { formatMonthName } from '../../lib/format'
import type { GoalKey } from '../../scripts/types'
import { useFinancialStateStore } from '../../stores/financial-state'
import { useGoalsStore } from '../../stores/goals'

withDefaults(defineProps<{ isActive?: boolean }>(), { isActive: false })

const financialStateStore = useFinancialStateStore()
const goalsStore = useGoalsStore()
const { viewModel, month } = storeToRefs(goalsStore)
const { formatMoney } = useMoneyFormatter()
const panel = useTemplateRef<InstanceType<typeof GoalEditPanel>>('panel')
const savingPanel = useTemplateRef<InstanceType<typeof SavingGoalPanel>>('savingPanel')

const rows = computed(() => [...viewModel.value.net.rows, ...viewModel.value.investment.rows])
// Mid-sentence ("a cierre de septiembre de 2026"), so the month stays lowercase.
const monthName = computed(
  () => `${formatMonthName(month.value).toLowerCase()} de ${financialStateStore.year}`,
)

function rowOf(key: GoalKey): GoalRowViewModel {
  return rows.value.find((row) => row.key === key)!
}

function namesOf(pace: GoalPace): string[] {
  return pace.by.map((key) => rowOf(key).name)
}

// The band leads with the pace that meets every term goal: they all measure
// net worth, so the most demanding monthly amount covers the other two.
const band = computed(() => {
  const { pace, met, next } = viewModel.value
  const binding = pace.net.by[0]
  return {
    value: `${formatMoney(pace.net.rate)}/mes`,
    note: binding
      ? `Lo marca ${rowOf(binding).name}, con plazo en ${dueLabel(rowOf(binding).goal.targetYear)}. A ese ritmo llegas a tiempo a todos.`
      : 'Los plazos de patrimonio que tienes definidos ya están cumplidos.',
    facts: [
      { label: 'Cartera, al mes', value: formatMoney(pace.investment.rate) },
      { label: 'Cumplidos', value: `${met.count} de ${met.total}`, valueId: 'goals-met' },
      { label: 'Próximo plazo', value: next ? dueLabel(next.targetYear) : '—' },
    ],
  }
})

const investmentNote = computed(() => {
  const { pace } = viewModel.value
  if (!pace.investment.rate) return 'Cada meta se mide contra su propio valor.'
  return `Cada meta se mide contra su propio valor. ${portfolioPaceSentence(formatMoney(pace.investment.rate), namesOf(pace.investment))}`
})

// How the portfolio goal splits into its two parts and whatever is left.
const allocation = computed(() => {
  const { funds, crypto, total, rest } = viewModel.value.investment.allocation
  const whole = Math.max(total, funds + crypto)
  if (!whole || !(funds + crypto)) return null
  const share = (value: number) => (value / whole) * 100
  const segments = [
    {
      id: 'funds',
      label: 'Fondos indexados',
      weight: share(funds),
      color: 'var(--chart-series-1)',
      detail: formatMoney(funds),
    },
    {
      id: 'crypto',
      label: 'Criptomonedas',
      weight: share(crypto),
      color: 'var(--chart-series-2)',
      detail: formatMoney(crypto),
    },
    ...(rest > 0
      ? [
          {
            id: 'rest',
            label: 'Resto de la cartera',
            weight: share(rest),
            color: 'var(--line-strong)',
            detail: formatMoney(rest),
          },
        ]
      : []),
  ].filter((segment) => segment.weight > 0)
  const text =
    rest > 0
      ? `Fondos y cripto reservan ${formatMoney(funds + crypto)} de los ${formatMoney(total)} de la meta total; ${formatMoney(rest)} quedan para el resto de la cartera.`
      : rest < 0
        ? `Las metas de fondos y cripto superan en ${formatMoney(-rest)} la meta de la cartera total.`
        : 'Las metas de fondos y cripto suman exactamente la meta de la cartera total.'
  return { segments, text }
})

function editSaving(id: string): void {
  const goal = viewModel.value.savingGoals.find((item) => item.id === id)
  if (goal) savingPanel.value?.openEdit(goal)
}

function edit(key: GoalKey): void {
  panel.value?.openEdit(rowOf(key))
}
</script>

<template>
  <AppSection id="goals" :is-active="isActive">
    <div class="mx-auto grid w-full max-w-7xl min-w-0 gap-6">
      <PageHeader
        kicker="Metas financieras"
        title="Objetivos"
        title-id="goals-title"
        lede="Cuánto te falta para cada meta y a qué ritmo llegas a tiempo."
      >
        <template #aside>
          <p class="text-text-muted text-sm" data-goals-month>Cifras a cierre de {{ monthName }}</p>
        </template>
      </PageHeader>

      <InkBand
        label="Ritmo que cumple tus plazos de patrimonio"
        aria-label="Ritmo necesario"
        value-id="goals-pace"
        :value="band.value"
        :facts="band.facts"
      >
        <template #note>
          <p class="text-ink-muted text-sm sm:text-base" data-goals-pace-note>{{ band.note }}</p>
        </template>
      </InkBand>

      <DocumentSurface>
        <NumberedBlock
          number="01"
          title="Patrimonio neto"
          title-id="goals-net-title"
          description="Corto, medio y largo plazo se miden contra la misma cifra, así que comparten escala: la línea marca dónde estás hoy."
        >
          <GoalLedger
            :rows="viewModel.net.rows"
            label="Objetivos de patrimonio neto"
            :format-money="formatMoney"
            :cursor="{
              left: viewModel.net.cursor,
              label: `Hoy · ${formatMoney(viewModel.net.current)}`,
            }"
            @edit="edit"
          />
        </NumberedBlock>

        <NumberedBlock
          number="02"
          title="Cartera"
          title-id="goals-investment-title"
          :description="investmentNote"
        >
          <GoalLedger
            :rows="viewModel.investment.rows"
            label="Objetivos de la cartera"
            :format-money="formatMoney"
            @edit="edit"
          />
          <div
            v-if="allocation"
            class="text-text-muted grid gap-x-6 gap-y-2 text-sm sm:grid-cols-[minmax(0,16rem)_minmax(0,1fr)] sm:items-center"
            data-goals-allocation
          >
            <AllocationBar
              :segments="allocation.segments"
              label="Reparto de la meta de la cartera"
            />
            <p>{{ allocation.text }}</p>
          </div>
        </NumberedBlock>

        <NumberedBlock
          number="03"
          title="Ahorro"
          title-id="goals-saving-title"
          description="Metas que creas tú. Cada una suma los ahorros de su categoría, también los anteriores."
        >
          <SavingGoalsBlock
            :rows="viewModel.savingGoals"
            :format-money="formatMoney"
            @add="savingPanel?.openNew()"
            @edit="editSaving"
          />
        </NumberedBlock>
      </DocumentSurface>
    </div>

    <GoalEditPanel ref="panel" :month-name="monthName" />
    <SavingGoalPanel ref="savingPanel" />
  </AppSection>
</template>

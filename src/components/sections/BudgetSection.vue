<script setup lang="ts">
import { atMonth, type Month } from '../../lib/month'
import SetupRequirement from '../onboarding/SetupRequirement.vue'
import { storeToRefs } from 'pinia'
import { computed, ref, useTemplateRef } from 'vue'

import BudgetPlanPanel from '../budget/BudgetPlanPanel.vue'
import BudgetTable from '../budget/BudgetTable.vue'
import { deviationSpan, REMAINING_LABEL, TYPE_LABEL } from '../budget/budget-text'
import AppSection from '../ui/AppSection.vue'
import DocumentSurface from '../ui/DocumentSurface.vue'
import FigureStrip, { type FigureStripItem } from '../ui/FigureStrip.vue'
import PageHeader from '../ui/PageHeader.vue'
import SectionTabs from '../ui/SectionTabs.vue'
import { useMoneyFormatter } from '../../composables/useMoneyFormatter'
import { BUDGET_TYPES } from '../../domain/budget/view-model'
import { formatPercent, formatWholeAmount } from '../../lib/format'
import type { BudgetType } from '../../scripts/types'
import { useBudgetStore } from '../../stores/budget'

withDefaults(defineProps<{ isActive?: boolean }>(), { isActive: false })

const budgetStore = useBudgetStore()
const { viewModel } = storeToRefs(budgetStore)
const { formatMoney, formatSignedMoney } = useMoneyFormatter()
const panel = useTemplateRef<InstanceType<typeof BudgetPlanPanel>>('panel')

const active = ref<BudgetType>('expense')
const needsCategories = computed(() => budgetStore.getCategoriesForType(active.value).length === 0)
const view = computed(() => viewModel.value.types[active.value])

const tabs = computed(() =>
  BUDGET_TYPES.map((type) => ({
    id: type,
    label: TYPE_LABEL[type],
    count: viewModel.value.types[type].count,
  })),
)

const strip = computed<FigureStripItem[]>(() => {
  const { totals, remaining } = view.value
  const { year, currentMonth } = viewModel.value
  const share = totals.plannedTotal ? (totals.actualTotal / totals.plannedTotal) * 100 : 0
  const diff = totals.diffToDate
  const closed = currentMonth > 1
  return [
    {
      label: `Presupuestado en ${year}`,
      value: formatMoney(totals.plannedTotal),
      note: `unos ${formatWholeAmount(totals.plannedTotal / 12)} € al mes`,
    },
    {
      label: 'Real hasta hoy',
      value: formatMoney(totals.actualTotal),
      note: `${formatPercent(share, { digits: 1 })} de lo previsto en el año`,
    },
    {
      label: REMAINING_LABEL[active.value],
      value: formatMoney(remaining),
      note: 'de aquí a diciembre',
    },
    closed
      ? {
          label: `Desvío ${deviationSpan(currentMonth, { long: true })}`,
          value: formatSignedMoney(diff),
          tone: totals.tone ?? undefined,
          note:
            Math.abs(diff) < 0.005
              ? 'justo lo previsto'
              : `${diff < 0 ? 'por debajo' : 'por encima'} de lo previsto`,
        }
      : { label: 'Desvío', value: '—', note: 'aún no hay meses cerrados' },
  ]
})

function updateCell(category: string, month: Month, value: number): void {
  if (needsCategories.value) return
  const row = view.value.rows.find((candidate) => candidate.category === category)
  if (row && Math.abs(atMonth(row.cells, month).planned - value) < 0.005) return
  budgetStore.updateBudgetValue(active.value, category, month, value)
}

function openPlan(category: string): void {
  if (needsCategories.value) return
  const row = view.value.rows.find((candidate) => candidate.category === category)
  if (row) panel.value?.openPlan(active.value, row)
}
</script>

<template>
  <AppSection id="budget" :is-active="isActive">
    <div class="mx-auto grid w-full max-w-7xl min-w-0 gap-6">
      <PageHeader
        :kicker="`Planificación anual · ${viewModel.year}`"
        title="Presupuesto"
        title-id="budget-title"
        lede="Lo que prevés por categoría y mes, frente a lo que registras en Movimientos."
      />

      <SectionTabs
        v-model="active"
        :tabs="tabs"
        label="Tipo de presupuesto"
        panel-id-prefix="budget-panel-"
        data-key="budget-tab"
      />

      <SetupRequirement
        v-if="needsCategories"
        :message="`Añade categorías de ${TYPE_LABEL[active].toLowerCase()} para planificar este presupuesto.`"
        action="Editar categorías"
        target="categories"
      />

      <DocumentSurface
        v-else
        :id="`budget-panel-${active}`"
        role="tabpanel"
        :aria-label="TYPE_LABEL[active]"
        class="min-w-0"
      >
        <div class="py-5 sm:py-6" aria-label="Resumen del año" role="group" data-budget-summary>
          <FigureStrip :items="strip" />
        </div>

        <BudgetTable
          :key="active"
          :view="view"
          :current-month="viewModel.currentMonth"
          :year="viewModel.year"
          @plan="openPlan"
          @update="updateCell"
        />
      </DocumentSurface>
    </div>

    <BudgetPlanPanel ref="panel" :year="viewModel.year" :current-month="viewModel.currentMonth" />
  </AppSection>
</template>

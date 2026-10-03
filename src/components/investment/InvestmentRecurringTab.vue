<script setup lang="ts">
import { computed, ref } from 'vue'

import InvestmentRecurringRulePanel from './InvestmentRecurringRulePanel.vue'
import BaseButton from '../ui/BaseButton.vue'
import ConfirmDialog from '../ui/ConfirmDialog.vue'
import FigureStrip, { type FigureStripItem } from '../ui/FigureStrip.vue'
import IconButton from '../ui/IconButton.vue'
import LedgerTable, { type LedgerColumn } from '../ui/LedgerTable.vue'
import ToggleSwitch from '../ui/ToggleSwitch.vue'
import { useMoneyFormatter } from '../../composables/useMoneyFormatter'
import { ruleMonthlyEquivalent, summarizeRecurringPlan } from '../../domain/investment/view-model'
import { frequencyLabel } from '../../domain/recurring/occurrences'
import { formatDueLabel, formatShortDate } from '../../lib/format'
import type { RecurringFrequency, RecurringRule } from '../../scripts/types'
import { useFinancialStateStore } from '../../stores/financial-state'
import { useRecurringStore } from '../../stores/recurring'

// The Compras recurrentes tab: what the plan commits each month and the plan
// itself, each rule switched on or off in place. Creating and editing happen
// in the side panel; nothing is bought until its pending movement is confirmed.
defineProps<{ isActive: boolean }>()

const recurringStore = useRecurringStore()
const financialStateStore = useFinancialStateStore()
const { formatMoney } = useMoneyFormatter()

const panel = ref<InstanceType<typeof InvestmentRecurringRulePanel> | null>(null)
const pendingDelete = ref<RecurringRule | null>(null)
const confirmOpen = computed({
  get: () => pendingDelete.value !== null,
  set: (value: boolean) => {
    if (!value) pendingDelete.value = null
  },
})

const rules = computed(() => recurringStore.rules.filter((rule) => rule.type === 'investment'))
const plan = computed(() => summarizeRecurringPlan(rules.value))
const today = computed(() => recurringStore.today())

const figures = computed<FigureStripItem[]>(() => [
  { label: 'Comprometido al mes', value: `≈ ${formatMoney(plan.value.monthly)}` },
  {
    label: 'Reglas',
    value: String(plan.value.active),
    suffix: `${plan.value.active === 1 ? 'activa' : 'activas'} de ${plan.value.total}`,
  },
  {
    label: 'Próxima compra',
    value: plan.value.next ? formatShortDate(plan.value.next.date) : '—',
    suffix: plan.value.next?.rule.symbol || plan.value.next?.rule.description,
  },
])

const columns: LedgerColumn<RecurringRule>[] = [
  { key: 'rule', label: 'Regla', rowHeader: true },
  { key: 'frequency', label: 'Frecuencia', hideBelow: 'md' },
  { key: 'amount', label: 'Importe', align: 'right' },
  { key: 'next', label: 'Próximo vencimiento', hideBelow: 'lg' },
  { key: 'state', label: 'Estado' },
  { key: 'actions', label: 'Acciones', align: 'right', hideBelow: 'sm' },
]

/** "Cada 3 meses": the unit of a frequency with an interval above one. */
const INTERVAL_UNIT: Record<RecurringFrequency, string> = {
  daily: 'días',
  weekly: 'semanas',
  monthly: 'meses',
  monthEnd: 'fines de mes',
  yearly: 'años',
}

function frequencyText(rule: RecurringRule): string {
  const interval = Math.max(1, Math.floor(rule.interval || 1))
  return interval === 1
    ? frequencyLabel(rule.frequency)
    : `Cada ${interval} ${INTERVAL_UNIT[rule.frequency]}`
}

function perMonthText(rule: RecurringRule): string {
  const monthly = ruleMonthlyEquivalent(rule)
  return monthly === rule.amount ? 'al mes' : `≈ ${formatMoney(monthly)}/mes`
}

function nameOf(rule: RecurringRule): string {
  return [rule.symbol, rule.description].filter(Boolean).join(' · ')
}

function accountName(rule: RecurringRule): string {
  return financialStateStore.accounts.find((account) => account.id === rule.accountId)?.name ?? ''
}

function confirmDelete(): void {
  if (pendingDelete.value) recurringStore.removeRule(pendingDelete.value.id)
}
</script>

<template>
  <section
    id="investment-tab-recurring"
    class="grid content-start gap-6"
    :hidden="!isActive"
    role="tabpanel"
    aria-labelledby="investment-tab-recurring-button"
    data-recurring-rules
  >
    <div class="flex flex-wrap items-center justify-between gap-4">
      <p class="text-text-muted max-w-[64ch] text-[0.9375rem] leading-relaxed">
        Cada vencimiento queda pendiente hasta que revises el precio y confirmes la compra. Nada se
        registra solo.
      </p>
      <BaseButton
        id="investment-recurring-new"
        variant="primary"
        class="max-sm:w-full"
        @click="panel?.openNew()"
      >
        <svg
          class="size-4.5"
          viewBox="0 0 24 24"
          fill="none"
          stroke="currentColor"
          stroke-width="2.2"
          stroke-linecap="round"
          aria-hidden="true"
        >
          <path d="M12 5v14M5 12h14" />
        </svg>
        Nueva compra recurrente
      </BaseButton>
    </div>

    <section
      class="border-line bg-panel rounded-lg border px-5 py-5 sm:px-7 sm:py-6"
      aria-label="Resumen del plan"
      data-recurring-summary
    >
      <FigureStrip :items="figures" />
    </section>

    <section
      class="border-line bg-panel shadow-soft grid gap-4 rounded-lg border px-2 pt-5 pb-4 sm:px-7 sm:pt-7"
      aria-labelledby="investment-recurring-plan-title"
    >
      <header class="grid gap-1.5 px-2 sm:px-0">
        <h3
          id="investment-recurring-plan-title"
          class="font-display text-text-main text-xl font-bold tracking-tight"
        >
          Plan de compras
        </h3>
        <p class="text-text-muted text-sm sm:text-base">
          Pausar una regla deja de generar pendientes sin perder su configuración.
        </p>
      </header>
      <LedgerTable
        :columns="columns"
        :rows="rules"
        :row-key="(rule) => rule.id"
        label="Plan de compras"
        empty-text="Aún no hay compras recurrentes. Crea una y sus vencimientos aparecerán como pendientes."
        :row-attrs="(rule) => ({ 'data-recurring-rule-id': rule.id })"
      >
        <template #cell-rule="{ row }">
          <!-- On small screens the actions column is hidden: the rule opens
               its panel, with frequency and account below. -->
          <button
            type="button"
            class="grid min-h-11 w-full min-w-0 gap-1 text-left sm:hidden"
            :class="{ 'opacity-60': !row.active }"
            :aria-label="`Editar la regla ${nameOf(row)}`"
            @click="panel?.openEdit(row)"
          >
            <span class="flex items-baseline gap-2">
              <span class="font-mono font-medium">{{ row.symbol }}</span>
              <span class="font-semibold">{{ row.description }}</span>
            </span>
            <span class="text-text-muted text-sm">
              {{ frequencyText(row) }} · {{ accountName(row) }}
            </span>
          </button>
          <span class="hidden min-w-0 gap-0.5 sm:grid" :class="{ 'opacity-60': !row.active }">
            <span class="flex items-baseline gap-2">
              <span class="font-mono font-medium">{{ row.symbol }}</span>
              <span class="font-semibold">{{ row.description }}</span>
            </span>
            <span class="text-text-muted text-sm">{{ row.category }} · {{ accountName(row) }}</span>
          </span>
        </template>
        <template #cell-frequency="{ row }">
          <span class="grid gap-0.5" :class="{ 'opacity-60': !row.active }">
            <span class="font-semibold">{{ frequencyText(row) }}</span>
            <span class="text-text-muted text-sm">Desde {{ formatShortDate(row.startDate) }}</span>
          </span>
        </template>
        <template #cell-amount="{ row }">
          <span
            class="grid justify-items-end gap-0.5 whitespace-nowrap"
            :class="{ 'opacity-60': !row.active }"
          >
            <span class="font-display tabular-nums" data-recurring-amount>
              {{ formatMoney(row.amount) }}
            </span>
            <span class="font-display text-text-muted text-xs tabular-nums">
              {{ perMonthText(row) }}
            </span>
          </span>
        </template>
        <template #cell-next="{ row }">
          <span v-if="row.active && row.nextOccurrenceDate" class="grid gap-0.5">
            <span class="font-semibold">{{ formatShortDate(row.nextOccurrenceDate) }}</span>
            <span class="text-text-muted text-sm">
              {{ formatDueLabel(row.nextOccurrenceDate, today) }}
            </span>
          </span>
          <span v-else class="grid gap-0.5">
            <span class="text-text-muted font-semibold">
              {{ row.active ? 'Sin vencimientos' : 'En pausa' }}
            </span>
            <span v-if="!row.active" class="text-text-muted text-sm">No generará pendientes</span>
          </span>
        </template>
        <template #cell-state="{ row }">
          <ToggleSwitch
            :model-value="row.active"
            :label="`Regla ${nameOf(row)} activa`"
            on-text="Activa"
            off-text="Pausada"
            @update:model-value="recurringStore.toggleRule(row.id, $event)"
            @click.stop
          />
        </template>
        <template #cell-actions="{ row }">
          <span class="flex justify-end">
            <IconButton
              icon="edit"
              :label="`Editar la regla ${nameOf(row)}`"
              @click="panel?.openEdit(row)"
            />
            <IconButton
              icon="trash"
              tone="danger"
              :label="`Eliminar la regla ${nameOf(row)}`"
              @click="pendingDelete = row"
            />
          </span>
        </template>
        <template #total-rule>
          <span class="text-text-muted text-sm font-semibold">Activas, al mes</span>
        </template>
        <template #total-amount>
          <span class="font-display font-semibold tabular-nums" data-recurring-monthly-total>
            ≈ {{ formatMoney(plan.monthly) }}
          </span>
        </template>
      </LedgerTable>
    </section>

    <InvestmentRecurringRulePanel ref="panel" @delete="pendingDelete = $event" />
    <ConfirmDialog
      v-model:open="confirmOpen"
      title="¿Eliminar esta regla?"
      title-id="investment-recurring-delete-title"
      confirm-label="Eliminar regla"
      @confirm="confirmDelete"
    >
      <template v-if="pendingDelete">
        {{ nameOf(pendingDelete) }} de {{ formatMoney(pendingDelete.amount) }}. Las compras ya
        registradas se mantienen; si solo quieres detenerla, pausa la regla.
      </template>
    </ConfirmDialog>
  </section>
</template>

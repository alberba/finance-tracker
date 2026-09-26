<script setup lang="ts">
import { computed, ref, shallowRef } from 'vue'

import InvestmentRecurringRuleForm from './InvestmentRecurringRuleForm.vue'
import InvestmentRecurringRuleList from './InvestmentRecurringRuleList.vue'
import { useMoneyFormatter } from '../../../composables/useMoneyFormatter'
import { useFinancialStateStore } from '../../../stores/financial-state'
import { useMovementsStore } from '../../../stores/movements'
import { useRecurringStore, type NewRecurringRuleInput } from '../../../stores/recurring'
import type { RecurringFrequency, RecurringRule } from '../../../scripts/types'

const financialStateStore = useFinancialStateStore()
const movementsStore = useMovementsStore()
const recurringStore = useRecurringStore()
const { formatMoney } = useMoneyFormatter()

const dialogRef = ref<HTMLDialogElement | null>(null)
const editingRuleId = shallowRef('')
const formVersion = shallowRef(0)

const investmentRules = computed(() =>
  recurringStore.rules.filter((rule) => rule.type === 'investment'),
)
const activeRules = computed(() => investmentRules.value.filter((rule) => rule.active))
const categoryOptions = computed(() => movementsStore.orderedCategories('investment'))
const editingRule = computed(
  () => investmentRules.value.find((rule) => rule.id === editingRuleId.value) ?? null,
)

const PER_MONTH: Record<RecurringFrequency, number> = {
  daily: 365.25 / 12,
  weekly: 52.18 / 12,
  monthly: 1,
  monthEnd: 1,
  yearly: 1 / 12,
}

const monthlyCommitment = computed(() =>
  activeRules.value.reduce(
    (sum, rule) => sum + (rule.amount * PER_MONTH[rule.frequency]) / Math.max(1, rule.interval || 1),
    0,
  ),
)

const nextRule = computed(
  () =>
    activeRules.value
      .filter((rule) => rule.nextOccurrenceDate)
      .sort((a, b) => String(a.nextOccurrenceDate).localeCompare(String(b.nextOccurrenceDate)))[0] ?? null,
)

function shortDate(date: string): string {
  const parsed = new Date(`${date}T00:00:00`)
  if (Number.isNaN(parsed.getTime())) return date
  return new Intl.DateTimeFormat('es-ES', { day: 'numeric', month: 'short' }).format(parsed).replace('.', '')
}

function openCreate(): void {
  editingRuleId.value = ''
  formVersion.value += 1
  dialogRef.value?.showModal?.()
}

function editRule(rule: RecurringRule): void {
  editingRuleId.value = rule.id
  dialogRef.value?.showModal?.()
}

function close(): void {
  editingRuleId.value = ''
  formVersion.value += 1
  if (dialogRef.value?.open) dialogRef.value.close()
}

function saveRule(input: NewRecurringRuleInput): void {
  const saved = editingRuleId.value
    ? recurringStore.updateRule(editingRuleId.value, { ...input, type: 'investment' })
    : recurringStore.addRule({ ...input, type: 'investment' })
  if (saved) close()
}
</script>

<template>
  <section class="inv-page" data-recurring-rules>
    <div class="inv-toolbar">
      <p class="inv-toolbar__intro">
        Cada vencimiento queda pendiente hasta que revises el precio y confirmes la compra. Nada se registra solo.
      </p>
      <button type="button" class="inv-primary" @click="openCreate">
        <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.2" stroke-linecap="round" aria-hidden="true"><path d="M12 5v14M5 12h14" /></svg>
        Nueva compra recurrente
      </button>
    </div>

    <section class="inv-facts" aria-label="Resumen del plan">
      <div>
        <p>Comprometido al mes</p>
        <strong>≈ {{ formatMoney(monthlyCommitment) }}</strong>
      </div>
      <div>
        <p>Reglas</p>
        <strong>{{ activeRules.length }}<small>{{ activeRules.length === 1 ? 'activa' : 'activas' }} de {{ investmentRules.length }}</small></strong>
      </div>
      <div>
        <p>Próxima compra</p>
        <strong v-if="nextRule">
          <span style="font-family: 'DM Mono', monospace">{{ nextRule.symbol || nextRule.description }}</span>
          <small>{{ shortDate(String(nextRule.nextOccurrenceDate)) }}</small>
        </strong>
        <strong v-else>—</strong>
      </div>
    </section>

    <section class="inv-doc" aria-labelledby="inv-plan-title">
      <div class="inv-block">
        <h3 id="inv-plan-title">Plan de compras</h3>
        <InvestmentRecurringRuleList
          :rules="investmentRules"
          @edit="editRule"
          @toggle="recurringStore.toggleRule"
          @delete="recurringStore.removeRule"
        />
      </div>
    </section>

    <dialog ref="dialogRef" class="inv-drawer" aria-labelledby="inv-recurring-title" @cancel="close">
      <header class="inv-drawer__head">
        <div>
          <p class="inv-kicker">Automatización de cartera</p>
          <h3 id="inv-recurring-title">{{ editingRule ? 'Editar compra recurrente' : 'Nueva compra recurrente' }}</h3>
        </div>
        <button type="button" class="inv-icon-btn" aria-label="Cerrar sin guardar" @click="close">
          <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" aria-hidden="true"><path d="M6 6l12 12M18 6L6 18" /></svg>
        </button>
      </header>
      <div class="inv-drawer__body">
        <InvestmentRecurringRuleForm
          :key="formVersion"
          :accounts="financialStateStore.accounts"
          :categories="categoryOptions"
          :editing-rule="editingRule"
          @save="saveRule"
          @cancel="close"
        />
      </div>
    </dialog>
  </section>
</template>

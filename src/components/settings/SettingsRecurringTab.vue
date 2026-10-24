<script setup lang="ts">
import SetupRequirement from '../onboarding/SetupRequirement.vue'
import { useAccountRequirement } from '../../composables/useAccountRequirement'
import { computed, ref } from 'vue'

import SettingsRecurringRulePanel from './SettingsRecurringRulePanel.vue'
import SettingsTabIntro from './SettingsTabIntro.vue'
import ConfirmDialog from '../ui/ConfirmDialog.vue'
import IconButton from '../ui/IconButton.vue'
import LedgerSurface from '../ui/LedgerSurface.vue'
import LedgerTable, { type LedgerColumn } from '../ui/LedgerTable.vue'
import ToggleSwitch from '../ui/ToggleSwitch.vue'
import { useMoneyFormatter } from '../../composables/useMoneyFormatter'
import { ruleMonthlyEquivalent } from '../../domain/investment/view-model'
import { frequencyText } from '../../domain/recurring/occurrences'
import { formatShortDate } from '../../lib/format'
import type { RecurringRule } from '../../scripts/types'
import { useFinancialStateStore } from '../../stores/financial-state'
import { useRecurringStore } from '../../stores/recurring'

// Recurrentes: the income, expense and saving rules that keep generating pending
// movements, switched on or off in place and edited in the side panel. The
// investment ones live in Inversión.
defineProps<{ isActive: boolean }>()

const recurringStore = useRecurringStore()
const financialStateStore = useFinancialStateStore()
const { formatMoney, formatSignedMoney } = useMoneyFormatter()

const panel = ref<InstanceType<typeof SettingsRecurringRulePanel> | null>(null)
const pendingDelete = ref<RecurringRule | null>(null)
const confirmOpen = computed({
  get: () => pendingDelete.value !== null,
  set: (value: boolean) => {
    if (!value) pendingDelete.value = null
  },
})

const rules = computed(() => recurringStore.rules.filter((rule) => rule.type !== 'investment'))

function signed(rule: Pick<RecurringRule, 'type'>, amount: number): number {
  return rule.type === 'income' ? amount : -amount
}

const monthlyNet = computed(() =>
  rules.value
    // A saving moves money between accounts, so it is not part of the net.
    .filter((rule) => rule.active && rule.type !== 'saving')
    .reduce((sum, rule) => sum + signed(rule, ruleMonthlyEquivalent(rule)), 0),
)

const columns: LedgerColumn<RecurringRule>[] = [
  { key: 'rule', label: 'Regla', rowHeader: true },
  { key: 'frequency', label: 'Frecuencia', hideBelow: 'md' },
  { key: 'next', label: 'Próxima', hideBelow: 'lg' },
  { key: 'amount', label: 'Importe', align: 'right' },
  { key: 'state', label: 'Estado' },
  { key: 'actions', label: 'Acciones', align: 'right', hideBelow: 'sm' },
]

function accountName(rule: RecurringRule): string {
  return financialStateStore.accounts.find((account) => account.id === rule.accountId)?.name ?? ''
}

function confirmDelete(): void {
  if (pendingDelete.value) recurringStore.removeRule(pendingDelete.value.id)
}
const { needsAccount } = useAccountRequirement()
</script>

<template>
  <section
    id="settings-tab-recurring"
    class="grid content-start gap-6"
    :hidden="!isActive"
    role="tabpanel"
    aria-labelledby="settings-tab-recurring-button"
    data-settings-recurring
  >
    <SettingsTabIntro
      title="Ingresos y gastos recurrentes"
      description="Reglas que generan movimientos pendientes. Las compras recurrentes viven en Inversión."
      :action="needsAccount ? undefined : 'Nueva regla'"
      @action="panel?.openNew()"
    />

    <SetupRequirement
      v-if="needsAccount"
      message="Crea una cuenta para añadir reglas recurrentes."
    />

    <LedgerSurface>
      <LedgerTable
        :columns="columns"
        :rows="rules"
        :row-key="(rule) => rule.id"
        label="Reglas recurrentes"
        empty-text="No hay reglas recurrentes de ingresos o gastos."
        :row-attrs="(rule) => ({ 'data-settings-rule-id': rule.id })"
      >
        <template #cell-rule="{ row }">
          <button
            type="button"
            class="group grid min-h-11 w-full min-w-0 gap-0.5 text-left"
            :class="{ 'opacity-60': !row.active }"
            :aria-label="`Editar la regla ${row.description}`"
            @click="panel?.openEdit(row)"
          >
            <span class="group-hover:text-primary font-semibold">{{ row.description }}</span>
            <span class="text-text-muted text-sm">{{ row.category }} · {{ accountName(row) }}</span>
          </button>
        </template>
        <template #cell-frequency="{ row }">
          <span :class="{ 'opacity-60': !row.active }">{{ frequencyText(row) }}</span>
        </template>
        <template #cell-next="{ row }">
          <span v-if="row.active && row.nextOccurrenceDate" class="font-display tabular-nums">
            {{ formatShortDate(row.nextOccurrenceDate) }}
          </span>
          <span v-else class="text-text-muted">{{
            row.active ? 'Sin vencimientos' : 'En pausa'
          }}</span>
        </template>
        <template #cell-amount="{ row }">
          <span
            class="font-display whitespace-nowrap tabular-nums"
            :class="[
              row.type === 'income' ? 'text-gain' : 'text-text-main',
              { 'opacity-60': !row.active },
            ]"
            data-settings-rule-amount
          >
            {{
              row.type === 'saving'
                ? formatMoney(row.amount)
                : formatSignedMoney(signed(row, row.amount))
            }}
          </span>
        </template>
        <template #cell-state="{ row }">
          <ToggleSwitch
            :model-value="row.active"
            :label="`Regla ${row.description} activa`"
            on-text="Activa"
            off-text="Pausada"
            @update:model-value="recurringStore.toggleRule(row.id, $event)"
          />
        </template>
        <template #cell-actions="{ row }">
          <span class="flex justify-end">
            <IconButton
              icon="trash"
              tone="danger"
              :label="`Eliminar la regla ${row.description}`"
              @click="pendingDelete = row"
            />
          </span>
        </template>
        <template #total-rule>
          <span class="text-text-muted text-sm font-semibold">Neto al mes de las activas</span>
        </template>
        <template #total-amount>
          <span
            class="font-display font-semibold whitespace-nowrap tabular-nums"
            :class="monthlyNet >= 0 ? 'text-gain' : 'text-loss'"
            data-settings-rules-net
          >
            ≈ {{ formatSignedMoney(monthlyNet) }}
          </span>
        </template>
      </LedgerTable>
    </LedgerSurface>

    <SettingsRecurringRulePanel ref="panel" @delete="pendingDelete = $event" />
    <ConfirmDialog
      v-model:open="confirmOpen"
      title="¿Eliminar esta regla?"
      title-id="settings-recurring-delete-title"
      confirm-label="Eliminar regla"
      @confirm="confirmDelete"
    >
      <template v-if="pendingDelete">
        {{ pendingDelete.description }} de {{ formatMoney(pendingDelete.amount) }}. Deja de generar
        pendientes; los movimientos ya registrados se mantienen. Si solo quieres detenerla, páusala.
      </template>
    </ConfirmDialog>
  </section>
</template>

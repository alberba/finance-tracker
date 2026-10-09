<script setup lang="ts">
import { computed, ref } from 'vue'

import AllocationBar from '../ui/AllocationBar.vue'
import ConfirmDialog from '../ui/ConfirmDialog.vue'
import DocumentSurface from '../ui/DocumentSurface.vue'
import FigureStrip from '../ui/FigureStrip.vue'
import IconButton from '../ui/IconButton.vue'
import LedgerTable, { type LedgerColumn } from '../ui/LedgerTable.vue'
import NumberedBlock from '../ui/NumberedBlock.vue'
import ToggleSwitch from '../ui/ToggleSwitch.vue'
import { seriesColor } from './transaction-types'
import { useMoneyFormatter } from '../../composables/useMoneyFormatter'
import { buildSubscriptionAnalysis, monthlyEquivalent } from '../../domain/subscriptions/analysis'
import { formatDayMonth, formatPercent, formatShortDate } from '../../lib/format'
import type { Subscription, SubscriptionFrequency } from '../../scripts/types'
import { todayISO } from '../../scripts/utils'
import { useMovementsStore } from '../../stores/movements'

// The Suscripciones tab: fixed spending normalised to a month, the list with
// its active/paused switches, where it goes by category and the next charges.
const emit = defineEmits<{ edit: [subscription: Subscription] }>()

const movementsStore = useMovementsStore()
const { formatMoney } = useMoneyFormatter()

const FREQUENCY_LABEL: Record<SubscriptionFrequency, string> = {
  weekly: 'Semanal',
  monthly: 'Mensual',
  quarterly: 'Trimestral',
  yearly: 'Anual',
}

const subscriptions = computed(() => movementsStore.subscriptions)
const pendingDelete = ref<Subscription | null>(null)
const confirmOpen = computed({
  get: () => pendingDelete.value !== null,
  set: (value: boolean) => {
    if (!value) pendingDelete.value = null
  },
})

function confirmDelete(): void {
  if (pendingDelete.value) movementsStore.deleteSubscription(pendingDelete.value.id)
}
const analysis = computed(() => buildSubscriptionAnalysis(subscriptions.value, todayISO()))

function inDays(days: number): string {
  if (days === 0) return 'hoy'
  if (days === 1) return 'mañana'
  return `en ${days} días`
}

const figures = computed(() => {
  const next = analysis.value.upcomingCharges[0]
  return [
    { label: 'Comprometido al mes', value: formatMoney(analysis.value.monthlyCommitment) },
    { label: 'Proyección anual', value: formatMoney(analysis.value.annualCommitment) },
    {
      label: 'Activas',
      value: String(analysis.value.activeCount),
      suffix: `de ${subscriptions.value.length} · ${formatMoney(analysis.value.pausedAnnualAmount)}/año en pausa`,
    },
    {
      label: 'Próximo cobro',
      value: next ? next.name : '—',
      suffix: next ? `${formatDayMonth(next.date)} · ${inDays(next.daysUntilCharge)}` : undefined,
    },
  ]
})

const columns: LedgerColumn<Subscription>[] = [
  { key: 'name', label: 'Suscripción', rowHeader: true },
  {
    key: 'frequency',
    label: 'Frecuencia',
    hideBelow: 'md',
    value: (row) => FREQUENCY_LABEL[row.frequency],
  },
  { key: 'amount', label: 'Importe', align: 'right' },
  { key: 'next', label: 'Próximo cobro', hideBelow: 'lg' },
  { key: 'state', label: 'Estado' },
  { key: 'actions', label: 'Acciones', align: 'right' },
]

const categoryRows = computed(() =>
  analysis.value.categoryBreakdown.map((row, index) => ({ ...row, color: seriesColor(index) })),
)
const segments = computed(() =>
  categoryRows.value.map((row) => ({
    id: row.label,
    label: row.label,
    weight: row.share * 100,
    color: row.color,
    detail: `${formatMoney(row.monthlyAmount)} / mes`,
  })),
)

const upcomingSummary = computed(() => {
  const count = analysis.value.next30DaysCount
  return `${count} ${count === 1 ? 'cobro' : 'cobros'} · ${formatMoney(analysis.value.next30DaysAmount)} en total`
})
</script>

<template>
  <div class="grid gap-6">
    <p class="text-text-muted max-w-3xl text-base">
      Tu gasto fijo periódico, pasado a la misma base mensual para compararlo. Cada cobro de una
      suscripción activa se apunta como gasto en el Registro cuando vence.
    </p>

    <FigureStrip :items="figures" aria-label="Resumen de suscripciones" />

    <DocumentSurface>
      <NumberedBlock number="01" title="Tus suscripciones" title-id="subscription-list-title">
        <LedgerTable
          :columns="columns"
          :rows="subscriptions"
          :row-key="(row) => row.id"
          label="Tus suscripciones"
          :row-attrs="(row) => ({ 'data-subscription-id': row.id })"
          :row-class="(row) => (row.active ? '' : 'text-text-muted')"
        >
          <template #empty
            >Aún no hay suscripciones. Añade la primera con «Nueva suscripción».</template
          >
          <template #cell-name="{ row }">
            <span class="grid gap-0.5">
              <span class="font-semibold" :class="row.active ? 'text-text-main' : ''">{{
                row.name
              }}</span>
              <span class="text-text-muted text-sm">
                {{ row.category }} · {{ movementsStore.getAccountName(row.accountId) }}
              </span>
            </span>
          </template>
          <template #cell-amount="{ row }">
            <span class="grid gap-0.5">
              <span class="font-display tabular-nums">{{ formatMoney(row.amount) }}</span>
              <span v-if="row.frequency !== 'monthly'" class="text-text-muted text-xs tabular-nums">
                ≈ {{ formatMoney(monthlyEquivalent(row)) }} / mes
              </span>
            </span>
          </template>
          <template #cell-next="{ row }">
            <span v-if="row.active" class="tabular-nums">{{
              formatShortDate(row.nextChargeDate)
            }}</span>
            <span v-else class="text-text-muted">En pausa</span>
          </template>
          <template #cell-state="{ row }">
            <ToggleSwitch
              :model-value="row.active"
              :label="`${row.name} activa`"
              on-text="Activa"
              off-text="Pausada"
              @update:model-value="movementsStore.setSubscriptionActive(row.id, $event)"
            />
          </template>
          <template #cell-actions="{ row }">
            <span class="flex justify-end">
              <IconButton icon="edit" :label="`Editar ${row.name}`" @click="emit('edit', row)" />
              <IconButton
                icon="trash"
                tone="danger"
                :label="`Eliminar la suscripción ${row.name}`"
                @click="pendingDelete = row"
              />
            </span>
          </template>
          <template #total-name>
            <span class="font-semibold">Total activas</span>
          </template>
          <template #total-amount>
            <span class="font-display font-bold tabular-nums" data-subscriptions-total>
              {{ formatMoney(analysis.monthlyCommitment) }} / mes
            </span>
          </template>
        </LedgerTable>
      </NumberedBlock>

      <div class="divide-line grid divide-y lg:grid-cols-2 lg:divide-x lg:divide-y-0">
        <NumberedBlock
          class="lg:pr-8"
          number="02"
          title="Dónde se va"
          title-id="subscription-categories-title"
          description="Equivalente mensual de las activas, por categoría."
        >
          <template v-if="categoryRows.length">
            <AllocationBar
              :segments="segments"
              label="Reparto de las suscripciones activas por categoría"
            />
            <ul class="divide-line grid divide-y">
              <li v-for="row in categoryRows" :key="row.label" class="flex items-center gap-3 py-3">
                <span class="flex min-w-0 flex-1 items-center gap-2.5">
                  <span
                    class="size-2.5 shrink-0 rounded-xs"
                    :style="{ background: row.color }"
                    aria-hidden="true"
                  ></span>
                  <span class="truncate">{{ row.label }}</span>
                </span>
                <span class="font-display tabular-nums"
                  >{{ formatMoney(row.monthlyAmount) }} / mes</span
                >
                <span class="text-text-muted w-14 text-right text-sm tabular-nums">
                  {{ formatPercent(row.share * 100, { digits: 0 }) }}
                </span>
              </li>
            </ul>
          </template>
          <p v-else class="border-line text-text-muted rounded-md border border-dashed p-4 text-sm">
            No hay suscripciones activas.
          </p>
        </NumberedBlock>

        <NumberedBlock
          class="lg:pl-8"
          number="03"
          title="Próximos 30 días"
          title-id="subscription-upcoming-title"
          :description="upcomingSummary"
        >
          <ol v-if="analysis.upcomingCharges.length" class="divide-line grid divide-y">
            <li
              v-for="charge in analysis.upcomingCharges"
              :key="charge.id"
              class="flex items-center gap-4 py-3"
            >
              <span class="font-display w-16 shrink-0 tabular-nums">{{
                formatDayMonth(charge.date)
              }}</span>
              <span class="grid min-w-0 flex-1 gap-0.5">
                <span class="truncate font-semibold">{{ charge.name }}</span>
                <span class="text-text-muted text-sm">{{ inDays(charge.daysUntilCharge) }}</span>
              </span>
              <span class="font-display tabular-nums">{{ formatMoney(charge.amount) }}</span>
            </li>
          </ol>
          <p v-else class="border-line text-text-muted rounded-md border border-dashed p-4 text-sm">
            Ningún cobro en los próximos 30 días.
          </p>
        </NumberedBlock>
      </div>
    </DocumentSurface>

    <ConfirmDialog
      v-model:open="confirmOpen"
      title="¿Eliminar esta suscripción?"
      title-id="subscription-delete-title"
      confirm-label="Eliminar suscripción"
      @confirm="confirmDelete"
    >
      <template v-if="pendingDelete">
        {{ pendingDelete.name }} de {{ formatMoney(pendingDelete.amount) }}. Deja de apuntar cobros;
        los gastos ya creados se conservan. Si solo quieres detenerla, páusala.
      </template>
    </ConfirmDialog>
  </div>
</template>

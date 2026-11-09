<script setup lang="ts">
import { computed, ref, shallowRef, watch } from 'vue'

import { foldMonthGroups, hasTypeRestriction } from '../../../domain/transactions/registry'
import { formatMonthYear } from '../../../lib/format'
import { atMonth } from '../../../lib/month'
import type { Transaction } from '../../../scripts/types'
import { todayISO } from '../../../scripts/utils'
import { useFinancialStateStore } from '../../../stores/financial-state'
import { useMovementsStore } from '../../../stores/movements'
import { useUiStore } from '../../../stores/ui'
import NeonButton from '../../ui/NeonButton.vue'
import NeonEmptyState from '../../ui/NeonEmptyState.vue'
import NeonUndoToast from '../../ui/NeonUndoToast.vue'
import NeonLedger from './NeonLedger.vue'
import NeonMovementDetail from './NeonMovementDetail.vue'
import NeonRegistryAside from './NeonRegistryAside.vue'
import NeonRegistryFilters from './NeonRegistryFilters.vue'
import {
  buildLedgerMonths,
  categoryBreakdown,
  emptyLedgerText,
  filterSummary,
  hasExtraFilters,
  movementDetail,
  narrowMonthGroups,
  NO_EXTRA_FILTERS,
  olderMonthsLabel,
  type ExtraFilters,
} from './registry-view-model'

// «Registro» of the new Movimientos: search and filters, the year's ledger
// from the aside's month to the newest (older months fold away, as the domain
// rule says, and every match shows while filtering), the month's summary in
// the aside, the detail of a movement in the shared panel and the undo notice
// after deleting one.
const movementsStore = useMovementsStore()
const financialStateStore = useFinancialStateStore()
const ui = useUiStore().ui

const extra = ref<ExtraFilters>({ ...NO_EXTRA_FILTERS })
const showOlder = ref(false)
const currency = computed(() => financialStateStore.currency || 'EUR')

// A different year or start month folds the older months again.
watch(
  () => [ui.txYear, ui.txFilterMonth],
  () => {
    showOlder.value = false
  },
)

const groups = computed(() => narrowMonthGroups(movementsStore.monthGroups, extra.value))
const filtering = computed(() => {
  const filters = ui.txFilters
  return Boolean(
    filters.search.trim() ||
    hasTypeRestriction(filters.types) ||
    filters.accountIds.length ||
    hasExtraFilters(extra.value),
  )
})
const fold = computed(() =>
  foldMonthGroups(groups.value, ui.txFilterMonth, filtering.value || showOlder.value),
)
const today = todayISO()
const months = computed(() =>
  buildLedgerMonths(fold.value.shown, {
    year: ui.txYear,
    today,
    currency: currency.value,
    accountName: accountName,
  }),
)
const olderLabel = computed(() => olderMonthsLabel(fold.value.hidden))

const monthRows = computed(
  () => groups.value.find((group) => group.month === ui.txFilterMonth)?.rows ?? [],
)
const summary = computed(() => filterSummary(monthRows.value, ui.txFilters.types, currency.value))
const breakdown = computed(() =>
  categoryBreakdown(monthRows.value, ui.txFilters.types, currency.value),
)
const monthTitle = computed(() => formatMonthYear(ui.txFilterMonth, ui.txYear))

function accountName(id: string): string {
  const asset = financialStateStore.investmentAssets.find((candidate) => candidate.id === id)
  return asset?.name ?? movementsStore.getAccountName(id)
}

function clearFilters(): void {
  ui.txFilters.search = ''
  ui.txFilters.types = []
  ui.txFilters.accountIds = []
  extra.value = { ...NO_EXTRA_FILTERS }
}

// --- Detail ---------------------------------------------------------------

// A copy, so the panel still reads the movement while it slides out after a
// delete took it from the list.
const detailMovement = shallowRef<Transaction | null>(null)
const detailOpen = ref(false)
const openId = computed(() => (detailOpen.value ? (detailMovement.value?.id ?? null) : null))

// The budget is the current year's: only that year's movements compare with it.
function plannedFor(tx: Transaction): number {
  if (tx.date.slice(0, 4) !== today.slice(0, 4)) return 0
  const slots = financialStateStore.budget.expense?.[tx.category]
  return slots ? Number(atMonth(slots, tx.month)) || 0 : 0
}

const detail = computed(() =>
  detailMovement.value
    ? movementDetail(detailMovement.value, financialStateStore.transactions, {
        currency: currency.value,
        accountName,
        plannedFor,
      })
    : null,
)

function openDetail(id: string): void {
  const movement = financialStateStore.transactions.find((tx) => tx.id === id)
  if (!movement) return
  detailMovement.value = { ...movement }
  detailOpen.value = true
}

// After an edit the panel shows the saved data.
watch(
  () => financialStateStore.transactions,
  (transactions) => {
    const current = detailMovement.value
    if (!current || !detailOpen.value) return
    const saved = transactions.find((tx) => tx.id === current.id)
    if (saved) detailMovement.value = { ...saved }
  },
)

// --- Delete and undo --------------------------------------------------------

const undoOpen = ref(false)
const undoMessage = ref('')
let deleted: Transaction | null = null

function remove(movement: Transaction): void {
  if (!movementsStore.deleteTransaction(movement.id, { notify: false })) return
  deleted = { ...movement }
  detailOpen.value = false
  undoMessage.value = `Movimiento eliminado: ${movement.description || movement.category}`
  undoOpen.value = true
}

function undo(): void {
  if (!deleted) return
  movementsStore.restoreTransaction(deleted)
  deleted = null
}

watch(undoOpen, (value) => {
  if (!value) deleted = null
})
</script>

<template>
  <div class="registry @container/registry grid min-w-0 gap-4">
    <div class="registry-body grid min-w-0 items-start gap-5">
      <div class="grid min-w-0 gap-4">
        <NeonRegistryFilters v-model:extra="extra" @clear="clearFilters" />
        <NeonLedger
          v-if="months.length"
          :months="months"
          :older-label="olderLabel"
          :open-id="openId"
          @open="openDetail"
          @show-older="showOlder = true"
        />
        <NeonEmptyState v-else role="status">
          {{ emptyLedgerText(ui.txYear, movementsStore.yearCount) }}
          <template v-if="filtering" #action>
            <NeonButton @click="clearFilters">Limpiar filtros</NeonButton>
          </template>
        </NeonEmptyState>
      </div>
      <NeonRegistryAside
        class="registry-aside"
        :month-title="monthTitle"
        :is-latest-month="movementsStore.isLatestMonth"
        :summary="summary"
        :breakdown="breakdown"
        @step="movementsStore.stepMonth"
      />
    </div>
    <NeonMovementDetail
      v-model:open="detailOpen"
      :movement="detailMovement"
      :detail="detail"
      @delete="remove"
    />
    <NeonUndoToast v-model:open="undoOpen" :message="undoMessage" @undo="undo" />
  </div>
</template>

<style scoped>
/* Two columns (content and a 400px aside) when the section is wide enough;
   one below, with the aside first so the month and its figure lead. */
.registry-aside {
  order: -1;
}

@container registry (min-width: 1040px) {
  .registry-body {
    grid-template-columns: minmax(0, 1fr) 400px;
  }

  .registry-aside {
    order: 0;
    position: sticky;
    inset-block-start: 24px;
  }
}
</style>

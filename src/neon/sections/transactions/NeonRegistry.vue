<script setup lang="ts">
import { computed, onBeforeUnmount, ref, shallowRef, watch } from 'vue'

import { useMediaQuery } from '../../../composables/useMediaQuery'
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
import { FRAME_QUERY } from '../../ui/sheet-drag'
import NeonBulkBar from './NeonBulkBar.vue'
import NeonLedger from './NeonLedger.vue'
import NeonMovementDetail from './NeonMovementDetail.vue'
import NeonRegistryAside from './NeonRegistryAside.vue'
import NeonRegistryFilters from './NeonRegistryFilters.vue'
import NeonRegistryMonthLine from './NeonRegistryMonthLine.vue'
import NeonReportPanel from './NeonReportPanel.vue'
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
  shownIds,
  type ExtraFilters,
} from './registry-view-model'

// «Registro» of the new Movimientos: search and filters, the year's ledger
// from the aside's month to the newest (older months fold away, as the domain
// rule says, and every match shows while filtering), the month's summary in
// the aside, the detail of a movement in the shared panel and the undo notice
// after deleting one. «Seleccionar» turns the rows into checkboxes for the
// bulk bar; «Exportar» opens the period report.
//
// On the mobile frame (artboard «Movimientos · móvil», #432) the aside gives
// way to one centered month line between the filters and the ledger, and the
// two actions turn into pills under it.
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
  detailOpen.value = false
  deleted = { ...movement }
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

// --- Selection and bulk actions ----------------------------------------------

// The store drops the selection when the year or a shared filter changes; the
// day and amount filters are this design's, so they drop it here. Either way
// a bulk action never reaches a row out of sight.
const selecting = ref(false)
const shown = computed(() => shownIds(months.value))
const allShownSelected = computed(
  () => shown.value.length > 0 && shown.value.every((id) => ui.txSelectedIds.includes(id)),
)

watch(extra, () => movementsStore.clearSelection())

function startSelecting(): void {
  detailOpen.value = false
  selecting.value = true
}

function stopSelecting(): void {
  movementsStore.clearSelection()
  selecting.value = false
}

function selectAllShown(): void {
  ui.txSelectedIds = [...shown.value]
}

onBeforeUnmount(() => movementsStore.clearSelection())

const reportOpen = ref(false)
const desktopFrame = useMediaQuery(FRAME_QUERY)

const pillClass =
  'outline-accent rounded-pill pointer-coarse:min-h-11 inline-flex min-h-[38px] items-center border px-4 text-[14px] font-extrabold focus-visible:outline-2 focus-visible:outline-offset-2 disabled:opacity-50 motion-safe:transition-transform motion-safe:duration-160 motion-safe:active:scale-[0.97]'
</script>

<template>
  <div class="registry @container/registry grid min-w-0 gap-4">
    <div class="registry-body grid min-w-0 items-start gap-5">
      <div class="grid min-w-0 gap-4">
        <NeonRegistryFilters v-model:extra="extra" @clear="clearFilters">
          <template v-if="desktopFrame" #actions>
            <NeonButton
              :aria-pressed="selecting"
              :disabled="!selecting && !months.length"
              @click="selecting ? stopSelecting() : startSelecting()"
            >
              {{ selecting ? 'Listo' : 'Seleccionar' }}
            </NeonButton>
            <NeonButton @click="reportOpen = true">Exportar</NeonButton>
          </template>
        </NeonRegistryFilters>
        <NeonRegistryMonthLine
          v-if="!desktopFrame"
          :month-title="monthTitle"
          :is-latest-month="movementsStore.isLatestMonth"
          :summary="summary"
          @step="movementsStore.stepMonth"
        >
          <template #actions>
            <button
              type="button"
              :class="[pillClass, 'border-ctrl-line text-text']"
              @click="reportOpen = true"
            >
              Exportar
            </button>
            <button
              type="button"
              :aria-pressed="selecting"
              :disabled="!selecting && !months.length"
              :class="[
                pillClass,
                selecting
                  ? 'bg-sel-bg border-sel-border text-sel-text'
                  : 'border-ctrl-line text-text',
              ]"
              @click="selecting ? stopSelecting() : startSelecting()"
            >
              {{ selecting ? 'Listo' : 'Seleccionar' }}
            </button>
          </template>
        </NeonRegistryMonthLine>
        <NeonLedger
          v-if="months.length"
          :months="months"
          :older-label="olderLabel"
          :open-id="openId"
          :selecting="selecting"
          :selected-ids="ui.txSelectedIds"
          @open="openDetail"
          @toggle="movementsStore.setSelected($event, !ui.txSelectedIds.includes($event))"
          @show-older="showOlder = true"
        />
        <NeonEmptyState v-else role="status">
          {{ emptyLedgerText(ui.txYear, movementsStore.yearCount) }}
          <template v-if="filtering" #action>
            <NeonButton @click="clearFilters">Limpiar filtros</NeonButton>
          </template>
        </NeonEmptyState>
        <NeonBulkBar
          v-if="selecting"
          :all-shown-selected="allShownSelected"
          @select-all="selectAllShown"
          @done="stopSelecting"
        />
      </div>
      <NeonRegistryAside
        v-if="desktopFrame"
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
    <NeonReportPanel v-model:open="reportOpen" />
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

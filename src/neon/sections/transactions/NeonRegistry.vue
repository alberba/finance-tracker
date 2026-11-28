<script setup lang="ts">
import type { ScreenDiagnostic } from '../../../domain/reports/diagnostic'
import { useScreenDiagnostic } from '../../reports/use-report-diagnostic'
import { computed, nextTick, onBeforeUnmount, ref, shallowRef, useTemplateRef, watch } from 'vue'

import { useMediaQuery } from '../../../composables/useMediaQuery'
import { useMovementDetailRequest } from '../../../composables/useMovementDetailRequest'
import {
  buildMonthGroups,
  foldMonthGroups,
  hasTypeRestriction,
} from '../../../domain/transactions/registry'
import { formatMonthYear } from '../../../lib/format'
import { atMonth, type Month } from '../../../lib/month'
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
import NeonRegistryMobileFilters from './NeonRegistryMobileFilters.vue'
import NeonRegistryMonthLine from './NeonRegistryMonthLine.vue'
import { swapLedger } from './ledger-swap'
import NeonReportPanel from './NeonReportPanel.vue'
import {
  buildLedgerMonths,
  categoryBreakdown,
  chosenType,
  emptyLedgerText,
  filterSummary,
  hasExtraFilters,
  monthCells,
  monthLineCount,
  movementDetail,
  narrowMonthGroups,
  NO_EXTRA_FILTERS,
  olderMonthsLabel,
  shownIds,
  type ExtraFilters,
} from './registry-view-model'

// «Registro» of Movimientos: search and filters, the year's ledger
// from the aside's month to the newest (older months fold away, as the domain
// rule says, and every match shows while filtering), the month's summary in
// the aside, the detail of a movement in the shared panel and the undo notice
// after deleting one. «Seleccionar» turns the rows into checkboxes for the
// bulk bar; «Exportar» opens the period report.
//
// On the mobile frame (DESIGN.md, «Movimientos en móvil») the aside gives way
// to the month line, first, as the page's summary, with the twelve months and
// «Exportar» in its sheet; the filters go to one sheet opened from the top bar
// (`barActions`: the registry is the page in sight), with the ones on as chips
// under the month line, and the ledger runs edge to edge, without cards.
withDefaults(defineProps<{ staggerRows: boolean; barActions?: boolean }>(), {
  barActions: false,
})

const movementsStore = useMovementsStore()
const financialStateStore = useFinancialStateStore()
const ui = useUiStore().ui

const extra = ref<ExtraFilters>({ ...NO_EXTRA_FILTERS })
const showOlder = ref(false)
const currency = computed(() => financialStateStore.currency || 'EUR')
const results = useTemplateRef('results')
const motionAllowed = useMediaQuery('(prefers-reduced-motion: no-preference)')
const hasFiltered = ref(false)

// Whether a filter changed since the page opened: the first rows' entrance
// only plays once.
watch(
  [
    () => ui.txFilters.types.join(),
    () => ui.txFilters.accountIds.join(),
    () => extra.value.category,
    () => extra.value.date,
  ],
  () => {
    hasFiltered.value = true
  },
)

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
useScreenDiagnostic('transactions', () => {
  if (ui.txTab !== 'registry') return { subview: 'subscriptions', checks: ['insufficient'] }
  const options: NonNullable<ScreenDiagnostic['options']> = []
  const checks: ScreenDiagnostic['checks'] = []
  if (ui.txFilters.search.trim()) options.push('search')
  if (hasTypeRestriction(ui.txFilters.types)) options.push('type')
  if (ui.txFilters.accountIds.length) options.push('account')
  if (extra.value.category) options.push('category')
  if (extra.value.date) options.push('date')
  if (showOlder.value) options.push('older')
  const count = (all: typeof groups.value) =>
    all.reduce((total, group) => total + group.rows.length, 0)
  if (filtering.value) {
    const unfiltered = buildMonthGroups(
      financialStateStore.transactions,
      ui.txYear,
      {
        search: '',
        types: [],
        accountIds: [],
      },
      ui.txSort,
    )
    checks.push(count(unfiltered) > count(groups.value) ? 'filters-reduce' : 'filters-active')
  } else {
    checks.push('filters-none')
  }
  if (fold.value.hidden.length > 0) checks.push('registry-folded')
  if (count(fold.value.shown) === 0) checks.push('registry-empty', 'insufficient')
  return { subview: 'registry', year: ui.txYear, month: ui.txFilterMonth, options, checks }
})

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
// The split ignores the category filter, so the picked category stays among
// the others in the summary.
const breakdownRows = computed(
  () =>
    narrowMonthGroups(movementsStore.monthGroups, { ...extra.value, category: '' }).find(
      (group) => group.month === ui.txFilterMonth,
    )?.rows ?? [],
)
const breakdown = computed(() =>
  categoryBreakdown(breakdownRows.value, ui.txFilters.types, currency.value),
)

function pickCategory(category: string): void {
  swapLedger(() => {
    extra.value = { ...extra.value, category }
  })
}
const monthTitle = computed(() => formatMonthYear(ui.txFilterMonth, ui.txYear))

// --- The phone's month line ---------------------------------------------------

const monthLine = computed(() => ({
  count: monthLineCount(monthRows.value, ui.txFilters.types),
  cells: monthCells(groups.value, ui.txYear, today, ui.txFilters.types, currency.value),
  previousYear: Math.max(...movementsStore.years.filter((year) => year < ui.txYear)),
  nextYear: Math.min(...movementsStore.years.filter((year) => year > ui.txYear)),
}))
// The month line already names the month the ledger starts with.
const untitledMonth = computed(() =>
  months.value[0]?.month === ui.txFilterMonth ? ui.txFilterMonth : undefined,
)

function stepYear(delta: -1 | 1): void {
  movementsStore.setYear(delta < 0 ? monthLine.value.previousYear : monthLine.value.nextYear)
}

// The ledger runs from the newest month down to the one picked: it scrolls to
// that month, or to the top when it is the first.
function pickMonth(month: Month): void {
  movementsStore.setMonth(month)
  void nextTick(() => {
    if (months.value[0]?.month === month) window.scrollTo({ top: 0 })
    else document.getElementById(`tx-month-${month}`)?.closest('section')?.scrollIntoView()
  })
}

function accountName(id: string): string {
  const asset = financialStateStore.investmentAssets.find((candidate) => candidate.id === id)
  return asset?.name ?? movementsStore.getAccountName(id)
}

function clearFilters(): void {
  swapLedger(() => {
    ui.txFilters.search = ''
    ui.txFilters.types = []
    ui.txFilters.accountIds = []
    extra.value = { ...NO_EXTRA_FILTERS }
  })
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

// A movement asked for from elsewhere (a row of the home) opens on arrival.
const detailRequest = useMovementDetailRequest()
watch(
  detailRequest.requested,
  (id) => {
    if (id) openDetail(detailRequest.take()!)
  },
  { immediate: true },
)

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

// Pressing a row's icon selects it and enters the selection; it ends with the
// bulk bar's close button or when the last row is unselected.
function selectRow(id: string): void {
  detailOpen.value = false
  movementsStore.setSelected(id, true)
  selecting.value = true
}

watch(
  () => ui.txSelectedIds.length,
  (count) => {
    if (count === 0) selecting.value = false
  },
)

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
</script>

<template>
  <div class="registry @container/registry grid min-w-0" :class="desktopFrame ? 'gap-5' : 'gap-4'">
    <template v-if="!desktopFrame">
      <NeonRegistryMonthLine
        :month-title="monthTitle"
        :count="monthLine.count"
        :total="summary.total"
        :is-net="!chosenType(ui.txFilters.types)"
        :year="ui.txYear"
        :months="monthLine.cells"
        :selected="ui.txFilterMonth"
        :has-previous-year="Number.isFinite(monthLine.previousYear)"
        :has-next-year="Number.isFinite(monthLine.nextYear)"
        @pick="pickMonth"
        @year="stepYear"
        @export="reportOpen = true"
      />
      <NeonRegistryMobileFilters
        v-model:extra="extra"
        :in-bar="barActions"
        :shown-count="shown.length"
        @clear="clearFilters"
      />
    </template>
    <NeonRegistryFilters v-else v-model:extra="extra" @clear="clearFilters">
      <template #actions>
        <NeonButton @click="reportOpen = true">Exportar</NeonButton>
      </template>
    </NeonRegistryFilters>
    <!-- Keep the sticky summary in place when the ledger is short. -->
    <div class="registry-body grid min-h-(--ui-dvh) min-w-0 content-start items-start gap-5">
      <div class="grid min-w-0 gap-4">
        <div ref="results" class="registry-results min-w-0">
          <NeonLedger
            v-if="months.length"
            :months="months"
            :untitled-month="desktopFrame ? undefined : untitledMonth"
            :flat="!desktopFrame"
            :older-label="olderLabel"
            :open-id="openId"
            :selecting="selecting"
            :selected-ids="ui.txSelectedIds"
            :stagger-rows="staggerRows && !hasFiltered"
            @open="openDetail"
            @toggle="movementsStore.setSelected($event, !ui.txSelectedIds.includes($event))"
            @select="selectRow"
            @show-older="showOlder = true"
          />
          <NeonEmptyState v-else role="status">
            {{ emptyLedgerText(ui.txYear, movementsStore.yearCount) }}
            <template v-if="filtering" #action>
              <NeonButton @click="clearFilters">Limpiar filtros</NeonButton>
            </template>
          </NeonEmptyState>
        </div>
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
        :category="extra.category"
        @step="movementsStore.stepMonth"
        @pick="pickCategory"
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

/* The ledger is the one part of a filter's list swap that crossfades
   (ledger-swap.ts; the snapshots are in neon.css). */
.registry-results {
  /* eslint-disable-next-line css/use-baseline -- Chrome 111, Safari 18, Firefox 144; without it the list changes at once. */
  view-transition-name: tx-ledger;
}

@container registry (min-width: 1040px) {
  .registry-body {
    grid-template-columns: minmax(0, 1fr) 400px;
    align-content: stretch;
  }

  .registry-aside {
    order: 0;
    position: sticky;
    inset-block-start: 24px;
  }
}
</style>

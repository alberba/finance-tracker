<script setup lang="ts">
import { useScreenDiagnostic } from '../../reports/use-report-diagnostic'
import { diagnosePositions } from './position-diagnostic'
import { storeToRefs } from 'pinia'
import { computed, nextTick, onBeforeUnmount, ref, shallowRef, watch } from 'vue'

import { useEntrySheet } from '../../../composables/useEntrySheet'
import { useStoredChoice } from '../../../composables/useStoredChoice'
import {
  BENCHMARKS,
  cumulativeReturn,
  DEFAULT_BENCHMARK,
  findBenchmark,
  sameMoneyInIndex,
} from '../../../domain/investment/benchmarks'
import { formatSignedMoney } from '../../../lib/format'
import { runClientHttp } from '../../../lib/client/runtime'
import { fetchBenchmarkCloses, fetchInstrumentCloses } from '../../../services/market-api'
import { useLiveQuotes } from '../../../composables/useLiveQuotes'
import { useMediaQuery } from '../../../composables/useMediaQuery'
import { buildPositionEvolution } from '../../../domain/investment/position-evolution'
import { summarizeQuoteStatus } from '../../../domain/investment/quote-status'
import {
  buildInvestmentDashboardViewModel,
  type ReturnMode,
} from '../../../domain/investment/view-model'
import { useFinancialStateStore } from '../../../stores/financial-state'
import { useInvestmentStore } from '../../../stores/investment'
import { useMarketStore } from '../../../stores/market'
import { useUiStore } from '../../../stores/ui'
import NeonBarTitle from '../../ui/NeonBarTitle.vue'
import NeonButton from '../../ui/NeonButton.vue'
import NeonEmptyState from '../../ui/NeonEmptyState.vue'
import { FRAME_QUERY } from '../../ui/sheet-drag'
import { assetDetail } from './asset-view-model'
import { instrumentDetail } from './instrument-view-model'
import { startPage, useAssetRoute } from './asset-route'
import { instrumentRows, sortByKey, sortCover, typeSections } from './cover-groups'
import { useInvestmentGroupingStore } from './grouping-store'
import NeonInvestmentAsset from './NeonInvestmentAsset.vue'
import NeonInvestmentAssetMobile from './NeonInvestmentAssetMobile.vue'
import NeonInvestmentCards from './NeonInvestmentCards.vue'
import NeonInvestmentInstrument from './NeonInvestmentInstrument.vue'
import NeonInvestmentChart from './NeonInvestmentChart.vue'
import NeonInvestmentMobile from './NeonInvestmentMobile.vue'
import NeonInvestmentAccounts from './NeonInvestmentAccounts.vue'
import NeonInvestmentScore from './NeonInvestmentScore.vue'
import {
  CHART_HEIGHT,
  CHART_WIDTH,
  compactChart,
  dropRows,
  feeRows,
  leadFigure,
  maxDrawdown,
  periodFigures,
  periodOptions,
  portfolioChart,
  accountRows,
  quoteNotice,
  signedPct,
  sortAccounts,
  toneOf,
  twrSeries,
  type Card,
  type SortDirection,
  type SortKey,
} from './view-model'

// Inversión (artboard «Inversión · 2560 px», #437): the
// cover. How the portfolio did in the period, simple or TWR; its evolution
// against what went in; each position, which opens its detail; the worst fall
// and the fees. The header says how fresh the quotes are, and warns when some
// are late. Return mode and month are the investment store's.
//
// A position opens its detail, a history entry of its own at
// `/inversion?activo=<id>`: the arrow and the browser's back button both return
// to the cover. From an account's positions, each instrument opens its own
// detail at `/inversion?instrumento=<id>` (#561, NeonInvestmentInstrument, the
// same on both frames): back returns to the account. On the desktop frame that is NeonInvestmentAsset (artboard
// «Inversión · detalle de activo (VWCE) · 2560 px», #439); on the mobile frame,
// NeonInvestmentAssetMobile (the same artboard, «móvil · Pixel 10», #440), from
// the same view model, with its movements as a second entry.
//
// The mobile frame gets its own composition (NeonInvestmentMobile, artboard
// «Inversión · móvil · Pixel 10», #438) from the same view model: there
// «Nueva operación» is the frame's «Apuntar» button and the positions live in
// a draggable sheet. Which one shows follows the frame's own media query, as
// in the dashboard.
const props = withDefaults(defineProps<{ isActive?: boolean }>(), { isActive: false })

const financialStateStore = useFinancialStateStore()
const investmentStore = useInvestmentStore()
const marketStore = useMarketStore()
const ui = useUiStore().ui
const { dashboardViewModel: vm } = storeToRefs(investmentStore)
const { openEntrySheet, openInvestmentEntry } = useEntrySheet()
useLiveQuotes()

const state = computed(() => financialStateStore.state)
const method = computed(() => ui.investmentReturnMode as ReturnMode)
const month = computed(() => ui.investmentMonth)

// The worst fall is measured on the TWR index and priced on the portfolio's
// own value, whichever return the strip shows.
const twr = computed(() => twrSeries(state.value, month.value))
const simpleVm = computed(() =>
  method.value === 'simple'
    ? vm.value
    : buildInvestmentDashboardViewModel(state.value, month.value, 'simple'),
)
const drawdown = computed(() => maxDrawdown(twr.value))
// Today's return under each method, for the mobile cover's method menu.
const returns = computed(() => {
  const simple = simpleVm.value.displayReturn
  const timed = twr.value.at(-1) ?? 0
  return {
    simple: { text: signedPct(simple), tone: toneOf(simple) },
    twr: { text: signedPct(timed), tone: toneOf(timed) },
  }
})

const periods = computed(() => periodOptions(state.value.year, new Date()))
const period = computed(() => periods.value.find((option) => option.value === month.value))
const figures = computed(() => {
  const [result, value, invested] = periodFigures(vm.value, method.value, {
    latest: period.value?.latest ?? false,
    twr: twr.value.at(-1) ?? 0,
  })
  return { result, value, invested }
})
// The index the chart compares the portfolio with, remembered on this device,
// and its month closes for the year (empty if it fails: the chart then shows
// the portfolio alone). While another index loads, the chart keeps the one it
// has, so it changes once instead of losing a line and gaining it back.
const benchmarkId = useStoredChoice(
  'neon-investment-benchmark',
  BENCHMARKS.map((benchmark) => benchmark.id),
  DEFAULT_BENCHMARK,
)
const loadedBenchmark = shallowRef<{ id: string; year: number; closes: number[] } | null>(null)
watch(
  [benchmarkId, () => state.value.year],
  async ([id, year]) => {
    let closes: number[] = []
    try {
      closes = await runClientHttp(fetchBenchmarkCloses(id, year))
    } catch {
      // No index: the chart draws the portfolio on its own.
    }
    if (id === benchmarkId.value && year === state.value.year) {
      loadedBenchmark.value = { id, year, closes }
    }
  },
  { immediate: true },
)
const benchmarkCloses = computed(() =>
  loadedBenchmark.value?.year === state.value.year ? loadedBenchmark.value.closes : [],
)
const benchmarkLoading = computed(
  () =>
    loadedBenchmark.value?.id !== benchmarkId.value ||
    loadedBenchmark.value?.year !== state.value.year,
)
// The chart waits a moment for its index before drawing, so the line doesn't
// draw itself on one scale and jump to another when the index lands.
const BENCHMARK_WAIT_MS = 400
const waited = ref(false)
const waitTimer = setTimeout(() => (waited.value = true), BENCHMARK_WAIT_MS)
const chartReady = computed(() => waited.value || loadedBenchmark.value !== null)
// In euros, what the same money would be worth in the index; in TWR, the
// index's own cumulative return. Both on the chart's points.
const benchmarkSeries = computed(() => {
  const closes = benchmarkCloses.value
  if (method.value === 'simple') {
    const [value, invested] = vm.value.valueSeries
    return sameMoneyInIndex(value.values, invested.values, closes)
  }
  return cumulativeReturn(closes).slice(0, twr.value.length)
})
const benchmark = computed(() => {
  const found = loadedBenchmark.value && findBenchmark(loadedBenchmark.value.id)
  return found && benchmarkSeries.value.length > 1
    ? { name: found.name, values: benchmarkSeries.value }
    : null
})
const difference = computed(() => {
  const theirs = benchmarkSeries.value
  const mine = method.value === 'simple' ? vm.value.valueSeries[0].values : twr.value
  if (theirs.length < 2 || theirs.length !== mine.length) return null
  const gap = mine[mine.length - 1] - theirs[theirs.length - 1]
  return {
    text:
      method.value === 'simple'
        ? formatSignedMoney(gap)
        : signedPct(gap).replace(/\s%$/, '\u00a0pt'),
    tone: toneOf(gap),
  }
})
// Over the chart: the return, with what it is on (simple) or what the
// portfolio is worth (TWR, whose chart has no euros).
const score = computed(() => {
  const { result, value, invested } = figures.value
  return {
    value: result.value,
    caption:
      method.value === 'simple'
        ? `${result.sub} sobre ${invested.value}`
        : `TWR · vale ${value.value}`,
    tone: result.tone,
  }
})
const chart = computed(() =>
  portfolioChart(vm.value, method.value, twr.value, drawdown.value, benchmark.value),
)
const compact = computed(() => compactChart(vm.value, method.value, twr.value))
const leadAt = (index: number | null) =>
  leadFigure(vm.value, method.value, twr.value, state.value.year, index)
const desktopFrame = useMediaQuery(FRAME_QUERY)
// Neither cover has a month picker: both always read up to today.
watch(
  periods,
  (options) => {
    const latest = options.at(-1)?.value
    if (latest !== undefined && month.value !== latest) investmentStore.setMonth(latest)
  },
  { immediate: true },
)
const notice = computed(() => quoteNotice(summarizeQuoteStatus(marketStore.valuation.instruments)))
const empty = computed(() => vm.value.accounts.length === 0)

// The cover comes in once each time it shows: blocks rise, rows follow. Past
// that, the rows stop animating, so a row that moves (a new sort, a quote that
// changes the weights) moves without coming in again.
const ENTRANCE_MS = 1400
const entering = ref(false)
let entranceTimer: ReturnType<typeof setTimeout> | undefined
watch(
  () => props.isActive,
  (active) => {
    clearTimeout(entranceTimer)
    entering.value = active
    if (active) entranceTimer = setTimeout(() => (entering.value = false), ENTRANCE_MS)
  },
  { immediate: true },
)
onBeforeUnmount(() => {
  clearTimeout(entranceTimer)
  clearTimeout(waitTimer)
})

const groupingStore = useInvestmentGroupingStore()
const grouping = computed(() => groupingStore.grouping)
const sortKey = ref<SortKey>('weight')
const sortDirection = ref<SortDirection>('desc')
// The period's change is the accounts' own: by instrument or type it sorts by weight.
const effectiveSortKey = computed<SortKey>(() =>
  grouping.value !== 'account' && sortKey.value === 'change' ? 'weight' : sortKey.value,
)
const rows = computed(() =>
  sortAccounts(accountRows(state.value, vm.value, month.value), sortKey.value, sortDirection.value),
)
const instruments = computed(() =>
  sortByKey(instrumentRows(vm.value), effectiveSortKey.value, sortDirection.value, (row) => row),
)
const sections = computed(() =>
  sortCover(typeSections(vm.value), effectiveSortKey.value, sortDirection.value),
)

// A row opens the account, or the instrument for the other two groupings.
function openRow(id: string): void {
  if (grouping.value === 'account') route.open(id)
  else route.openInstrument(id)
}

const cards = computed<Card[]>(() => [
  {
    id: 'investment-drops',
    title: 'Caídas máximas',
    rows: dropRows(drawdown.value, simpleVm.value.valueSeries[0].values),
  },
  {
    id: 'investment-fees',
    title: 'Comisiones',
    rows: feeRows(state.value, month.value, vm.value.investedCapital),
  },
])

const route = useAssetRoute()

// The evolution of each position of the open account: its units at each month
// close by the instrument's monthly close of the year. An instrument whose
// closes fail to load, or that has none, takes a share of the account's value
// instead (the domain's rule), so the detail draws without them meanwhile.
const loadedCloses = shallowRef<{ key: string; closes: Record<string, number[]> } | null>(null)
watch(
  [() => route.selected.value, () => state.value.year, () => vm.value.positions.length],
  async ([accountId, year]) => {
    if (!accountId) return
    const key = `${accountId}:${year}`
    if (loadedCloses.value?.key === key) return
    const held = vm.value.positions.filter((position) => position.accountId === accountId)
    // A direct link can open the detail before the state is in: wait for the positions.
    if (!held.length) return
    const found: Record<string, number[]> = {}
    await Promise.all(
      held.map(async ({ instrumentId }) => {
        const instrument = state.value.instruments.find((item) => item.id === instrumentId)
        if (!instrument) return
        try {
          const closes = await runClientHttp(fetchInstrumentCloses(instrument, year))
          if (closes.length) found[instrumentId] = closes
        } catch {
          // No history for this instrument: its line is the account's share.
        }
      }),
    )
    if (route.selected.value === accountId && state.value.year === year) {
      loadedCloses.value = { key, closes: found }
    }
  },
  { immediate: true },
)
const evolution = computed(() => {
  const accountId = route.selected.value
  const loaded = loadedCloses.value
  if (!accountId || loaded?.key !== `${accountId}:${state.value.year}`) return []
  return buildPositionEvolution(state.value, accountId, month.value, loaded.closes)
})
const asset = computed(() =>
  route.selected.value
    ? assetDetail(state.value, vm.value, route.selected.value, {
        compact: !desktopFrame.value,
        evolution: evolution.value,
      })
    : null,
)

const instrument = computed(() =>
  route.instrument.value ? instrumentDetail(state.value, vm.value, route.instrument.value) : null,
)

useScreenDiagnostic('investment', () => ({
  subview: route.selected.value
    ? route.movements.value
      ? 'asset-movements'
      : 'asset'
    : 'positions',
  year: state.value.year,
  month: month.value,
  options: [method.value, sortKey.value, sortDirection.value],
  checks: diagnosePositions(
    state.value,
    month.value,
    vm.value.accounts.map((row) => row.id),
    route.selected.value,
  ),
}))

// Opening or leaving the detail, or its movements, starts a new page.
watch(
  () => [
    asset.value?.id ?? null,
    instrument.value?.id ?? null,
    route.movements.value && !desktopFrame.value,
  ],
  async () => {
    await nextTick()
    if (props.isActive) startPage('investment-title')
  },
)
// Leaving the section takes its detail with it; the URL has already moved on.
watch(
  () => props.isActive,
  (active) => {
    if (!active) route.reset()
  },
)

function sortBy(key: SortKey, direction: SortDirection): void {
  sortKey.value = key
  sortDirection.value = direction
}
</script>

<template>
  <section
    v-show="isActive"
    id="investment"
    class="@container grid min-w-0 content-start gap-[26px]"
    aria-labelledby="investment-title"
  >
    <NeonBarTitle v-if="isActive && !desktopFrame && !asset && !instrument" title="Inversión" />
    <NeonInvestmentInstrument
      v-if="instrument"
      :detail="instrument"
      :touch="!desktopFrame"
      @back="route.closeInstrument"
    />
    <NeonInvestmentAssetMobile
      v-else-if="!desktopFrame && asset"
      :detail="asset"
      :movements="route.movements.value"
      @back="route.close"
      @open-instrument="route.openInstrument"
      @open-movements="route.openMovements"
      @close-movements="route.closeMovements"
      @buy="openInvestmentEntry({ side: 'buy', ...asset.entry }, $event)"
      @sell="openInvestmentEntry({ side: 'sell', ...asset.entry }, $event)"
    />

    <NeonInvestmentMobile
      v-else-if="!desktopFrame"
      :empty="empty"
      :notice="notice"
      :value-label="figures.value.label"
      :lead-at="leadAt"
      :chart="compact"
      :method="method"
      :returns="returns"
      :grouping="grouping"
      :rows="rows"
      :instruments="instruments"
      :sections="sections"
      :cards="cards"
      :entering="entering"
      @open="openRow"
      @group="groupingStore.setGrouping"
      @method="investmentStore.setReturnMode"
    />

    <NeonInvestmentAsset
      v-else-if="asset"
      :detail="asset"
      @back="route.close"
      @open-instrument="route.openInstrument"
      @buy="openInvestmentEntry({ side: 'buy', ...asset.entry }, $event)"
      @sell="openInvestmentEntry({ side: 'sell', ...asset.entry }, $event)"
    />

    <template v-else>
      <header
        class="motion-safe:animate-rise mbe-3 flex flex-wrap items-center justify-between gap-x-6 gap-y-3"
      >
        <div class="grid min-w-0 gap-1.5">
          <h1
            id="investment-title"
            tabindex="-1"
            class="font-display text-[clamp(30px,3.2cqi,44px)] leading-[1.1] font-bold tracking-[-0.03em] outline-none"
          >
            Inversión
          </h1>
          <p
            v-if="notice"
            class="text-note m-0 inline-flex items-center gap-2 font-bold"
            :class="notice.late ? 'text-soft' : 'text-muted'"
            :role="notice.late ? 'status' : undefined"
            :title="notice.title"
            data-investment-quotes
          >
            <span
              class="size-2 flex-none rounded-full"
              :class="notice.late ? 'bg-peach' : 'bg-gain'"
              aria-hidden="true"
            ></span>
            {{ notice.text }}
          </p>
        </div>
        <NeonButton variant="primary" @click="openEntrySheet">
          <svg
            class="size-[18px]"
            viewBox="0 0 24 24"
            fill="none"
            stroke="currentColor"
            stroke-width="2.6"
            stroke-linecap="round"
            aria-hidden="true"
          >
            <path d="M12 5v14M5 12h14" />
          </svg>
          Nueva operación
        </NeonButton>
      </header>

      <NeonEmptyState
        v-if="empty"
        class="motion-safe:animate-rise motion-safe:[animation-delay:50ms]"
      >
        Aún no tienes inversiones. Apunta una compra para empezar a seguir tu cartera.
      </NeonEmptyState>

      <template v-else>
        <div class="grid min-w-0 gap-5">
          <NeonInvestmentScore
            class="motion-safe:animate-rise motion-safe:[animation-delay:50ms]"
            :result="score"
            :difference="difference"
            :options="BENCHMARKS"
            :selected="benchmarkId"
            :loading="benchmarkLoading"
            :available="benchmark !== null"
            :method="method"
            @select="benchmarkId = $event"
            @method="investmentStore.setReturnMode"
          />
          <NeonInvestmentChart
            v-if="chartReady"
            class="motion-safe:animate-rise motion-safe:[animation-delay:150ms]"
            :chart="chart"
          />
          <div
            v-else
            :style="{ aspectRatio: `${CHART_WIDTH} / ${CHART_HEIGHT}` }"
            aria-hidden="true"
          ></div>
        </div>

        <NeonInvestmentAccounts
          :grouping="grouping"
          :rows="rows"
          :instruments="instruments"
          :sections="sections"
          :sort-key="effectiveSortKey"
          :sort-direction="sortDirection"
          :entering="entering"
          @open="openRow"
          @sort="sortBy"
          @group="groupingStore.setGrouping"
        />

        <NeonInvestmentCards
          class="motion-safe:animate-rise motion-safe:[animation-delay:250ms]"
          :cards="cards"
        />
      </template>
    </template>
  </section>
</template>

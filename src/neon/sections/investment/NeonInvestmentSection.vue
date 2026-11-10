<script setup lang="ts">
import { storeToRefs } from 'pinia'
import { computed, ref } from 'vue'

import { useEntrySheet } from '../../../composables/useEntrySheet'
import { useLiveQuotes } from '../../../composables/useLiveQuotes'
import { summarizeQuoteStatus } from '../../../domain/investment/quote-status'
import {
  buildInvestmentDashboardViewModel,
  type ReturnMode,
} from '../../../domain/investment/view-model'
import type { Month } from '../../../lib/month'
import { useFinancialStateStore } from '../../../stores/financial-state'
import { useInvestmentStore } from '../../../stores/investment'
import { useMarketStore } from '../../../stores/market'
import { useUiStore } from '../../../stores/ui'
import NeonButton from '../../ui/NeonButton.vue'
import NeonCard from '../../ui/NeonCard.vue'
import NeonChoiceMenu, { type ChoiceGroup } from '../../ui/NeonChoiceMenu.vue'
import NeonEmptyState from '../../ui/NeonEmptyState.vue'
import NeonInvestmentChart from './NeonInvestmentChart.vue'
import NeonInvestmentPositionDetail from './NeonInvestmentPositionDetail.vue'
import NeonInvestmentPositions from './NeonInvestmentPositions.vue'
import {
  dropRows,
  feeRows,
  maxDrawdown,
  periodFigures,
  periodOptions,
  portfolioChart,
  positionDetail,
  positionRows,
  quoteNotice,
  sortPositions,
  twrSeries,
  type CardRow,
  type SortDirection,
  type SortKey,
  TONE_TEXT,
} from './view-model'

// Inversión in the new design (artboard «Inversión · 2560 px», #437): the
// cover. How the portfolio did in the period, simple or TWR; its evolution
// against what went in; each position, which opens its detail; the worst fall
// and the fees. The header says how fresh the quotes are, and warns when some
// are late. Return mode and month are the investment store's, shared with the
// old design.
withDefaults(defineProps<{ isActive?: boolean }>(), { isActive: false })

const financialStateStore = useFinancialStateStore()
const investmentStore = useInvestmentStore()
const marketStore = useMarketStore()
const ui = useUiStore().ui
const { dashboardViewModel: vm } = storeToRefs(investmentStore)
const { openEntrySheet } = useEntrySheet()
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

const periods = computed(() => periodOptions(state.value.year, new Date()))
const period = computed(() => periods.value.find((option) => option.value === month.value))
const figures = computed(() =>
  periodFigures(vm.value, method.value, {
    latest: period.value?.latest ?? false,
    twr: twr.value.at(-1) ?? 0,
  }),
)
const chart = computed(() => portfolioChart(vm.value, method.value, twr.value, drawdown.value))
const notice = computed(() => quoteNotice(summarizeQuoteStatus(marketStore.valuation.instruments)))
const empty = computed(() => vm.value.positions.length === 0)

const sortKey = ref<SortKey>('weight')
const sortDirection = ref<SortDirection>('desc')
const rows = computed(() =>
  sortPositions(
    positionRows(state.value, vm.value, month.value),
    sortKey.value,
    sortDirection.value,
  ),
)

const cards = computed<Array<{ id: string; title: string; rows: CardRow[] }>>(() => [
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

const METHOD_GROUPS = computed<ChoiceGroup<ReturnMode>[]>(() => [
  {
    key: 'method',
    value: method.value,
    options: [
      { value: 'simple', label: 'Simple', hint: 'Ganancia sobre lo que has puesto' },
      {
        value: 'twr',
        label: 'TWR',
        hint: 'Rentabilidad ponderada en el tiempo: no depende de cuándo aportas',
      },
    ],
  },
])
const PERIOD_GROUPS = computed<ChoiceGroup<Month>[]>(() => [
  { key: 'month', value: month.value, options: periods.value },
])

const ICON_METHOD = 'M4 7h9M17 7h3M4 17h3M11 17h9M15 5v4M9 15v4'
const ICON_PERIOD = 'M4 6h16v14H4zM4 10h16M8 3v4M16 3v4'

// The panel keeps the last position while it slides out.
const openId = ref<string | null>(null)
const shownId = ref<string | null>(null)
const detailOpen = computed({
  get: () => openId.value !== null,
  set: (open) => {
    if (!open) openId.value = null
  },
})
const shown = computed(() => vm.value.positions.find((position) => position.id === shownId.value))
const detail = computed(() =>
  shownId.value ? positionDetail(state.value, vm.value, shownId.value) : null,
)

function openPosition(id: string): void {
  openId.value = shownId.value = id
}

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
    <header class="flex flex-wrap items-end justify-between gap-x-6 gap-y-3.5">
      <h1
        id="investment-title"
        tabindex="-1"
        class="font-display text-[clamp(30px,3.2cqi,44px)] leading-[1.1] font-bold tracking-[-0.03em] outline-none"
      >
        Inversión
      </h1>
      <div class="flex min-w-0 flex-col items-end gap-3">
        <p
          v-if="notice"
          class="text-label tracking-label m-0 inline-flex items-center gap-2 text-end font-extrabold uppercase"
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
        <NeonButton variant="primary" @click="openEntrySheet()">
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
      </div>
    </header>

    <NeonEmptyState v-if="empty">
      Aún no tienes inversiones. Apunta una compra para empezar a seguir tu cartera.
    </NeonEmptyState>

    <template v-else>
      <div class="flex flex-wrap justify-end gap-x-5 gap-y-3">
        <NeonChoiceMenu
          :text="`Periodo · ${period?.label ?? ''}`"
          label="Periodo"
          :icon="ICON_PERIOD"
          :groups="PERIOD_GROUPS"
          @select="(_, value) => investmentStore.setMonth(value)"
        />
        <NeonChoiceMenu
          :text="method === 'twr' ? 'Rentabilidad TWR' : 'Rentabilidad simple'"
          label="Cómo medir la rentabilidad"
          :icon="ICON_METHOD"
          :groups="METHOD_GROUPS"
          @select="(_, value) => investmentStore.setReturnMode(value)"
        />
      </div>

      <div
        role="group"
        aria-label="Cifras del periodo"
        aria-live="polite"
        class="grid min-w-0 grid-cols-3"
        data-investment-figures
      >
        <div
          v-for="(figure, index) in figures"
          :key="figure.key"
          class="grid min-w-0 content-start gap-1 px-5"
          :class="index ? 'border-line border-s' : 'ps-0'"
          :data-investment-figure="figure.key"
        >
          <span
            class="text-muted text-label tracking-label inline-flex items-center gap-2 font-extrabold uppercase"
          >
            <span
              v-if="index === 0"
              class="bg-text size-2.5 flex-none rounded-full"
              aria-hidden="true"
            ></span>
            {{ figure.label }}
          </span>
          <span
            class="font-display text-figure-lg truncate font-semibold whitespace-nowrap tabular-nums"
            :class="TONE_TEXT[figure.tone]"
          >
            {{ figure.value }}
          </span>
          <span class="text-note min-h-[1.4em] font-extrabold" :class="TONE_TEXT[figure.tone]">
            {{ figure.sub }}
          </span>
        </div>
      </div>

      <NeonInvestmentChart :chart="chart" />

      <NeonInvestmentPositions
        :rows="rows"
        :sort-key="sortKey"
        :sort-direction="sortDirection"
        @open="openPosition"
        @sort="sortBy"
      />

      <div
        class="grid min-w-0 grid-cols-[repeat(auto-fit,minmax(min(100%,340px),1fr))] gap-x-14 gap-y-8"
      >
        <NeonCard v-for="card in cards" :key="card.id" :title="card.title" :title-id="card.id">
          <ul class="m-0 list-none p-0">
            <li
              v-for="row in card.rows"
              :key="row.label"
              class="border-line flex items-baseline justify-between gap-3 border-t py-2.5"
            >
              <span class="text-row font-bold">{{ row.label }}</span>
              <span
                class="font-display text-figure-row flex-none font-semibold whitespace-nowrap tabular-nums"
                :class="TONE_TEXT[row.tone]"
              >
                {{ row.value }}
              </span>
            </li>
          </ul>
        </NeonCard>
      </div>
    </template>

    <NeonInvestmentPositionDetail
      v-model:open="detailOpen"
      :title="shown?.name ?? ''"
      :kicker="shown?.symbol ?? 'Posición'"
      :detail="detail"
    />
  </section>
</template>

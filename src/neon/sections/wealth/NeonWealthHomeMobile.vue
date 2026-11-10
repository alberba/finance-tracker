<script setup lang="ts">
import { storeToRefs } from 'pinia'
import { computed, ref } from 'vue'

import { formatMoney, splitDecimals } from '../../../lib/format'
import NeonEmptyState from '../../ui/NeonEmptyState.vue'
import NeonWealthAccountDetail from './NeonWealthAccountDetail.vue'
import NeonWealthMix from './NeonWealthMix.vue'
import NeonWealthPlot from './NeonWealthPlot.vue'
import { ACCOUNT_FILTERS, mobileAccounts } from './mobile-view-model'
import type { EvolutionKind, EvolutionPeriod } from './view-model'
import { useWealthCover } from './wealth-cover'
import { useNeonWealthScreens, type WealthTab } from './wealth-screens'

// Cover of the new Patrimonio in the mobile frame (artboard «Patrimonio ·
// móvil · Pixel 10»): the net worth centred over its own chart, the two ways
// into «Balance por meses», and below either the accounts, with a filter by
// group, or how the assets are split. The same data as the desktop cover; an
// account opens its sheet.
const {
  month,
  view,
  needsAccount,
  totals,
  card,
  chart,
  mix,
  period,
  chartKind,
  openMonths,
  shownAccount,
  detailOpen,
  showAccount,
} = useWealthCover()
const { tab, filter } = storeToRefs(useNeonWealthScreens())

const net = computed(() => splitDecimals(formatMoney(totals.value.net)))
// A long figure steps down so it stays on one line.
const focused = ref(false)
const netSize = computed(() =>
  focused.value ? 'text-[28px]' : net.value.whole.length > 7 ? 'text-[34px]' : 'text-[38px]',
)
// «Cerrar mes» while it is open; once closed the same button reviews it.
const closeLabel = computed(() =>
  card.value.action.startsWith('Cerrar') ? 'Cerrar mes' : 'Revisar mes',
)
const TONE_TEXT = {
  gain: 'text-gain',
  loss: 'text-loss',
  muted: 'text-muted',
  plain: 'text-text',
} as const
const FOCUS_ICON = {
  open: 'M4 9V4h5M20 9V4h-5M4 15v5h5M20 15v5h-5',
  close: 'M6 6l12 12M18 6 6 18',
}
// Behind the figure the chart is a soft backdrop (blurred and faded at its
// edges); the corner button brings it forward.
const BACKDROP_MASK =
  'linear-gradient(to bottom, #000 0, #000 50%, rgb(0 0 0 / 0.7) 70%, rgb(0 0 0 / 0.25) 88%, transparent 100%), linear-gradient(to right, transparent 0, #000 9%, #000 91%, transparent 100%)'

// The line runs edge to edge: the first point at the left, the last one at the right.
const plotted = computed(() => {
  const points = chart.value.points
  if (chartKind.value === 'bars' || points.length < 2) return points
  const first = points[0].x
  const span = points[points.length - 1].x - first
  return points.map((point) => ({ ...point, x: ((point.x - first) / span) * 97 }))
})
const accounts = computed(() => mobileAccounts(view.value, month.value, filter.value))

const PERIODS: { value: EvolutionPeriod; label: string }[] = [
  { value: 'month', label: 'Mes' },
  { value: 'quarter', label: 'Trimestre' },
]
const KINDS: { value: EvolutionKind; label: string; icon: string }[] = [
  { value: 'line', label: 'Gráfica de línea', icon: 'M3 17l5-7 4 3 8-9M16 4h4v4' },
  { value: 'bars', label: 'Gráfica de barras', icon: 'M5 20v-7M12 20V5M19 20v-10' },
]
const TABS: { value: WealthTab; label: string }[] = [
  { value: 'accounts', label: 'Cuentas' },
  { value: 'mix', label: 'Reparto' },
]

const SEGMENT =
  'rounded-pill outline-accent font-extrabold focus-visible:outline-2 focus-visible:outline-offset-2 motion-safe:transition-transform motion-safe:duration-160 motion-safe:ease-out motion-safe:active:scale-[0.97]'
const ACTION =
  'rounded-pill outline-accent text-row inline-flex min-h-[52px] min-w-0 items-center justify-center gap-2.5 px-3.5 font-extrabold focus-visible:outline-2 focus-visible:outline-offset-2 motion-safe:transition-transform motion-safe:duration-160 motion-safe:ease-out motion-safe:active:scale-[0.97]'
</script>

<template>
  <div class="grid min-w-0 gap-5">
    <h1
      id="wealth-title"
      tabindex="-1"
      class="font-display text-h1 tracking-h1 px-1 leading-[1.1] font-bold outline-none"
    >
      Patrimonio
    </h1>

    <NeonEmptyState v-if="needsAccount" role="status">
      Crea una cuenta de efectivo, inversión o pasivo en Configuración para ver tu patrimonio.
    </NeonEmptyState>

    <template v-else>
      <section
        aria-label="Patrimonio neto"
        class="motion-safe:animate-rise relative -mx-4 grid min-w-0 justify-items-center gap-1.5 px-4 pbs-[22px] pbe-3 text-center motion-safe:transition-[min-height] motion-safe:duration-300"
        :class="focused ? 'min-h-[360px] content-start' : '-mbs-3 min-h-[210px] content-center'"
      >
        <button
          type="button"
          :aria-pressed="focused"
          :aria-label="focused ? 'Volver a la vista compacta' : 'Ver el gráfico completo'"
          class="text-soft outline-accent absolute inset-e-2 inset-bs-0 inset-be-auto z-10 grid size-11 place-items-center rounded-full focus-visible:outline-2 focus-visible:outline-offset-2"
          @click="focused = !focused"
        >
          <svg
            class="size-5"
            viewBox="0 0 24 24"
            fill="none"
            stroke="currentColor"
            stroke-width="2"
            stroke-linecap="round"
            stroke-linejoin="round"
            aria-hidden="true"
          >
            <path :d="focused ? FOCUS_ICON.close : FOCUS_ICON.open" />
          </svg>
        </button>
        <div
          role="img"
          :aria-label="chart.label"
          class="pointer-events-none absolute motion-safe:transition-[filter] motion-safe:duration-150"
          :class="
            focused
              ? 'inset-x-2 inset-bs-32 inset-be-[54px]'
              : 'inset-x-0 inset-bs-0 -inset-be-16 blur-[1.5px]'
          "
          :style="focused ? undefined : { maskImage: BACKDROP_MASK, maskComposite: 'intersect' }"
          data-wealth-plot
        >
          <NeonWealthPlot :points="plotted" :kind="chartKind" dots="last" />
        </div>
        <p
          class="font-display relative leading-[1.1] font-bold tracking-[-0.035em] whitespace-nowrap tabular-nums"
          :class="netSize"
          data-wealth-net
        >
          {{ net.whole
          }}<span v-if="net.rest" class="text-muted text-[0.42em] tracking-[-0.02em]">{{
            net.rest
          }}</span>
        </p>
        <p
          v-if="chart.delta"
          class="text-delta relative font-extrabold"
          :class="TONE_TEXT[chart.delta.tone]"
        >
          {{ chart.delta.text }}
          <span class="text-muted text-meta ms-3 font-normal">{{ chart.delta.since }}</span>
        </p>

        <div class="relative mbs-0.5 flex flex-wrap justify-center gap-2">
          <div
            role="group"
            aria-label="Periodo de la gráfica"
            class="rounded-pill flex gap-[3px] bg-[color-mix(in_oklab,var(--color-bg)_60%,transparent)] p-[3px]"
          >
            <button
              v-for="option in PERIODS"
              :key="option.value"
              type="button"
              :aria-pressed="period === option.value"
              class="text-note min-h-9 px-2.5 pointer-coarse:min-h-11 pointer-coarse:px-3"
              :class="[SEGMENT, period === option.value ? 'bg-sel-bg text-sel-text' : 'text-soft']"
              @click="period = option.value"
            >
              {{ option.label }}
            </button>
          </div>
          <div
            role="group"
            aria-label="Tipo de gráfica"
            class="rounded-pill flex gap-[3px] bg-[color-mix(in_oklab,var(--color-bg)_60%,transparent)] p-[3px]"
          >
            <button
              v-for="option in KINDS"
              :key="option.value"
              type="button"
              :aria-pressed="chartKind === option.value"
              :aria-label="option.label"
              :title="option.label"
              class="grid min-h-9 w-10 place-items-center pointer-coarse:min-h-11 pointer-coarse:w-11"
              :class="[
                SEGMENT,
                chartKind === option.value ? 'bg-sel-bg text-sel-text' : 'text-soft',
              ]"
              @click="chartKind = option.value"
            >
              <svg
                class="size-4"
                viewBox="0 0 24 24"
                fill="none"
                stroke="currentColor"
                stroke-width="2"
                stroke-linecap="round"
                stroke-linejoin="round"
                aria-hidden="true"
              >
                <path :d="option.icon" />
              </svg>
            </button>
          </div>
        </div>
      </section>

      <nav
        aria-label="Balance por meses"
        class="motion-safe:animate-rise grid grid-cols-2 gap-2.5 motion-safe:[animation-delay:50ms]"
      >
        <button
          type="button"
          :class="ACTION"
          class="bg-accent text-on-accent"
          @click="openMonths('close')"
        >
          <svg
            class="size-[22px] shrink-0"
            viewBox="0 0 24 24"
            fill="none"
            stroke="currentColor"
            stroke-width="2"
            stroke-linecap="round"
            stroke-linejoin="round"
            aria-hidden="true"
          >
            <path d="M4 6h16v14H4zM4 10h16M8 3v4M16 3v4M9 15l2 2 4-4" />
          </svg>
          <span class="truncate">{{ closeLabel }}</span>
        </button>
        <button
          type="button"
          :class="ACTION"
          class="bg-panel2 text-text"
          @click="openMonths('history')"
        >
          <svg
            class="size-[22px] shrink-0"
            viewBox="0 0 24 24"
            fill="none"
            stroke="currentColor"
            stroke-width="2"
            stroke-linecap="round"
            stroke-linejoin="round"
            aria-hidden="true"
          >
            <path d="M4 7h16M4 12h10M4 17h7" />
          </svg>
          <span class="truncate">Por meses</span>
        </button>
      </nav>

      <div
        role="group"
        aria-label="Vista"
        class="bg-panel2 rounded-pill motion-safe:animate-rise grid grid-cols-2 gap-[3px] p-[3px] motion-safe:[animation-delay:100ms]"
      >
        <button
          v-for="option in TABS"
          :key="option.value"
          type="button"
          :aria-pressed="tab === option.value"
          class="text-note min-h-9 px-2 pointer-coarse:min-h-11"
          :class="[SEGMENT, tab === option.value ? 'bg-sel-bg text-sel-text' : 'text-soft']"
          @click="tab = option.value"
        >
          {{ option.label }}
        </button>
      </div>

      <section
        v-if="tab === 'accounts'"
        aria-labelledby="wealth-accounts-title"
        class="motion-safe:animate-rise grid min-w-0 gap-3"
      >
        <h2 id="wealth-accounts-title" class="text-block-title font-extrabold">Cuentas</h2>
        <div
          role="group"
          aria-label="Filtrar cuentas"
          class="-mx-4 flex [scrollbar-width:none] gap-2 overflow-x-auto px-4 [&::-webkit-scrollbar]:hidden"
        >
          <button
            v-for="option in ACCOUNT_FILTERS"
            :key="option.value"
            type="button"
            :aria-pressed="filter === option.value"
            class="text-meta min-h-[38px] flex-none border px-3.5 pointer-coarse:min-h-11"
            :class="[
              SEGMENT,
              filter === option.value
                ? 'bg-sel-bg text-sel-text border-sel-border'
                : 'border-ctrl-line text-soft',
            ]"
            @click="filter = option.value"
          >
            {{ option.label }}
          </button>
        </div>
        <ul class="bg-panel border-line rounded-card min-w-0 border px-4 py-1">
          <li v-for="row in accounts" :key="`${row.kind}-${row.id}`">
            <button
              type="button"
              class="text-text outline-accent grid min-h-16 w-full grid-cols-[40px_minmax(0,1fr)_auto_14px] items-center gap-x-3 py-2 text-start focus-visible:outline-2 focus-visible:-outline-offset-2"
              :aria-label="`${row.name}: ${row.value}. Ver mes a mes`"
              @click="showAccount(row.kind, row.id)"
            >
              <span
                class="bg-panel2 text-soft grid size-10 place-items-center rounded-full text-[15px] font-extrabold"
                aria-hidden="true"
                >{{ row.initial }}</span
              >
              <span class="grid min-w-0">
                <span class="truncate text-[16px] font-bold">{{ row.name }}</span>
                <span class="text-muted text-meta truncate">{{ row.note }}</span>
              </span>
              <span
                class="font-display text-end text-[16px] font-semibold whitespace-nowrap tabular-nums"
                :class="row.empty ? 'text-muted' : 'text-text'"
                >{{ row.value }}</span
              >
              <svg
                class="text-faint size-3.5"
                viewBox="0 0 24 24"
                fill="none"
                stroke="currentColor"
                stroke-width="2"
                stroke-linecap="round"
                stroke-linejoin="round"
                aria-hidden="true"
              >
                <path d="M9 6l6 6-6 6" />
              </svg>
            </button>
          </li>
        </ul>
      </section>

      <NeonWealthMix
        v-else
        :segments="mix.segments"
        :note="mix.note"
        :label="mix.label"
        class="motion-safe:animate-rise"
      />
    </template>

    <NeonWealthAccountDetail
      v-model:open="detailOpen"
      :view="view"
      :target="shownAccount"
      :month="month"
    />
  </div>
</template>

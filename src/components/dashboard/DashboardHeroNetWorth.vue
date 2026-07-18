<script setup lang="ts">
import { computed, nextTick, useTemplateRef, watch } from 'vue'

import { renderLineChart } from '../../scripts/charts'
import InfoIcon from '../../assets/icons/info.svg?component'
import type {
  DashboardHeroRange,
  DashboardKpis,
  DashboardLineChart,
  DashboardRangeOption,
  DashboardTone,
} from '../../domain/dashboard/view-model'
import { formatCompactMoneyForCurrency, formatMoneyForCurrency } from '../../scripts/money-format'
import { resolveCssColor } from '../../scripts/css-color'

const props = defineProps<{
  kpis?: DashboardKpis
  chart: DashboardLineChart
  ranges: DashboardRangeOption[]
  currency: string
}>()

const emit = defineEmits<{
  'change-range': [range: DashboardHeroRange]
}>()

const canvas = useTemplateRef<HTMLCanvasElement>('canvas')
const netWorthLabel = computed(() => props.kpis?.netWorth ?? '0,00 €')
const netWorthSizeClass = computed(() => {
  const labelLength = netWorthLabel.value.replace(/\s/g, '').length
  if (labelLength >= 17) {
    return 'net-worth-value--compact'
  }
  if (labelLength >= 13) {
    return 'net-worth-value--medium'
  }
  return ''
})

watch([() => props.chart, () => props.currency], renderChart, { deep: true, immediate: true })

async function renderChart(): Promise<void> {
  await nextTick()
  if (!canvas.value) {
    return
  }
  const accent = resolveCssColor('--hero-chart-line', '#93B4FF', canvas.value)
  renderLineChart(canvas.value, props.chart.values, {
    color: accent,
    fill: `${accent}22`,
    axisColor: resolveCssColor('--hero-chart-axis', '#C2CCDA', canvas.value),
    borderWidth: 3,
    fillOpacity: 0.34,
    gridColor: resolveCssColor(
      '--hero-chart-grid',
      'rgba(194, 204, 218, 0.3)',
      canvas.value,
    ),
    pointBorderColor: resolveCssColor('--hero-chart-point', '#FFFFFF', canvas.value),
    labels: props.chart.labels,
    formatValue: (value) => formatMoneyForCurrency(value, props.currency),
    formatAxisValue: (value) => formatCompactMoneyForCurrency(value, props.currency),
    includeZeroBaseline: false,
    yPaddingRatio: 0.12,
  })
}

function netWorthChangeClass(tone: DashboardTone | undefined): string {
  if (tone === 'good') {
    return 'bg-(--income-bg) text-(--income)'
  }
  if (tone === 'bad') {
    return 'bg-(--expense-bg) text-(--expense)'
  }
  return 'bg-(--bg-subtle) text-text-faint'
}
</script>

<template>
  <section
    class="net-worth-hero relative grid min-w-0 overflow-hidden rounded-3xl lg:grid-cols-[minmax(20rem,0.82fr)_minmax(0,1.18fr)]"
    aria-label="Patrimonio neto"
  >
    <div class="relative z-1 flex min-w-0 flex-col justify-center gap-3 p-5 sm:p-7 lg:p-9">
      <p
        class="inline-flex items-center gap-2 text-sm font-semibold tracking-[0.08em] text-(--ink-muted) uppercase"
      >
        Patrimonio neto
        <InfoIcon class="size-4" />
      </p>
      <strong
        id="kpi-net-worth"
        class="net-worth-value font-display text-(--ink-text)"
        :class="netWorthSizeClass"
      >
        {{ netWorthLabel }}
      </strong>
      <p class="flex flex-wrap items-center gap-2.5 text-(--ink-muted)">
        <span
          id="kpi-net-worth-change"
          class="rounded-full px-2.5 py-1 font-mono text-xs font-medium"
          :class="netWorthChangeClass(kpis?.netWorthChange.tone)"
        >
          {{ kpis?.netWorthChange.label ?? '--' }}
        </span>
        <span class="text-sm">vs. año anterior</span>
      </p>
      <p class="mt-1 text-sm text-(--ink-muted)">
        Ahorro anual:
        <strong id="kpi-annual-savings" class="font-mono font-medium text-(--ink-text)">
          {{ kpis?.annualSavings ?? '0,00 €' }}
        </strong>
      </p>
    </div>

    <div
      class="relative z-1 grid min-w-0 gap-3 border-t border-white/8 p-4 pt-3 sm:p-6 lg:border-t-0 lg:border-l lg:p-7"
    >
      <div
        class="flex max-w-full gap-1 justify-self-start overflow-x-auto rounded-full bg-white/7 p-1 lg:justify-self-end"
        role="group"
        aria-label="Rango temporal del gráfico"
      >
        <button
          v-for="range in ranges"
          :key="range.value"
          type="button"
          class="aria-pressed:text-primary min-h-11 min-w-11 rounded-full px-3 py-2 text-xs font-bold text-(--ink-muted) transition-colors hover:bg-white/8 hover:text-(--ink-text) aria-pressed:bg-white"
          :aria-pressed="range.active"
          :data-range="range.value"
          @click="emit('change-range', range.value)"
        >
          {{ range.label }}
        </button>
      </div>
      <div class="net-worth-chart relative h-52 w-full sm:h-60 lg:h-64">
        <canvas
          id="chart-networth"
          ref="canvas"
          class="absolute inset-0 h-full! w-full!"
          aria-label="Evolución de patrimonio neto"
        ></canvas>
      </div>
    </div>
  </section>
</template>

<style scoped>
.net-worth-hero {
  --hero-chart-line: #93b4ff;
  --hero-chart-axis: #c2ccda;
  --hero-chart-grid: rgba(194, 204, 218, 0.3);
  --hero-chart-point: #ffffff;

  background:
    radial-gradient(
      circle at 9% 10%,
      color-mix(in srgb, var(--primary) 32%, transparent),
      transparent 34%
    ),
    radial-gradient(
      circle at 92% 84%,
      color-mix(in srgb, var(--income) 16%, transparent),
      transparent 38%
    ),
    var(--bg-sidebar);
  box-shadow: 0 20px 55px color-mix(in srgb, var(--bg-sidebar) 26%, transparent);
}

.net-worth-hero::after {
  position: absolute;
  inset: 0;
  background-image: linear-gradient(rgba(255, 255, 255, 0.025) 1px, transparent 1px);
  background-size: 100% 24px;
  content: '';
  pointer-events: none;
}

.net-worth-chart {
  overflow: hidden;
  border-radius: 1rem;
  background: linear-gradient(180deg, rgba(255, 255, 255, 0.035), rgba(255, 255, 255, 0.01));
  box-shadow: inset 0 0 0 1px rgba(255, 255, 255, 0.055);
}

.net-worth-value {
  display: block;
  max-width: 100%;
  font-size: clamp(2.05rem, 9vw, 4.75rem);
  font-variant-numeric: tabular-nums;
  font-weight: 800;
  letter-spacing: -0.055em;
  line-height: 0.98;
  overflow-wrap: anywhere;
}

.net-worth-value--medium {
  font-size: clamp(1.85rem, 7.8vw, 3.5rem);
}

.net-worth-value--compact {
  font-size: clamp(1.25rem, 5vw, 2.5rem);
}

@media (min-width: 1024px) {
  .net-worth-value {
    font-size: clamp(2.05rem, 2.65vw, 3.25rem);
  }

  .net-worth-value--medium {
    font-size: clamp(1.8rem, 2.25vw, 2.8rem);
  }

  .net-worth-value--compact {
    font-size: clamp(1.3rem, 1.75vw, 2.2rem);
  }
}
</style>

<script setup lang="ts">
import { computed, onBeforeUnmount, shallowRef, useId, watch } from 'vue'

import NeonChartSeries from '../../ui/NeonChartSeries.vue'
import { chartTween, restFrame } from './chart-tween'
import {
  AXIS_LABEL_LEFT,
  CHART_HEIGHT,
  END_LABEL_LEFT,
  GRID_END,
  GRID_START,
  type PortfolioChart,
} from './view-model'

// The cover's evolution chart: the portfolio over the period, against what
// went into it (dashed) in euros or over the zero line in TWR, with each line's
// figure written at its end instead of a legend, and the worst fall marked on
// its trough in the TWR view.
const props = defineProps<{ chart: PortfolioChart }>()

// With an index, the space between the two lines is tinted: green where the
// portfolio is ahead, rose where it is behind.
const clip = `gap-${useId()}`
const END_TEXT = { value: 'text-text', benchmark: 'text-lilac', invested: 'text-muted' } as const

// It draws itself from left to right when it shows (`anim-draw`); the dots
// light up and the end figures fade in as the line reaches them (`anim-dot`).
// After that, a new scale on the same months (another index, a quote that
// moves the top) reframes it in 700ms instead of jumping (chart-tween); other
// months or another unit swap it. Without motion it always swaps.
const REFRAME_MS = 700
const frame = shallowRef(restFrame(props.chart))
const drawn = computed(() => frame.value.chart)
let raf = 0

// cubic-bezier(0.23, 1, 0.32, 1), close enough: a quint ease-out.
const ease = (progress: number) => 1 - (1 - progress) ** 5

watch(
  () => props.chart,
  (next) => {
    cancelAnimationFrame(raf)
    const tween = matchMedia('(prefers-reduced-motion: reduce)').matches
      ? null
      : chartTween(frame.value.chart, next)
    if (!tween) {
      frame.value = restFrame(next)
      return
    }
    const start = performance.now()
    const step = (now: number) => {
      const progress = Math.min((now - start) / REFRAME_MS, 1)
      frame.value = progress < 1 ? tween(ease(progress)) : restFrame(next)
      if (progress < 1) raf = requestAnimationFrame(step)
    }
    raf = requestAnimationFrame(step)
  },
)
onBeforeUnmount(() => cancelAnimationFrame(raf))

const gridY = (top: number) => (top / 100) * CHART_HEIGHT
// Shorter than the dashboard's draw, so the cover is done in about a second.
const LINE_IN = { animationDuration: '800ms', animationDelay: '60ms' }
const DOT = 'motion-safe:animate-dot origin-center [transform-box:fill-box]'
const DOT_IN = { animationDelay: '620ms' }
const AFTER_LINE =
  'motion-safe:animate-fade-in motion-safe:[animation-delay:620ms] motion-safe:[animation-fill-mode:backwards]'
</script>

<template>
  <figure class="m-0 min-w-0" data-investment-chart>
    <div class="relative min-w-0">
      <svg
        :viewBox="chart.viewBox"
        width="100%"
        role="img"
        :aria-label="chart.label"
        class="block h-auto overflow-visible"
      >
        <path
          v-for="tick in frame.grid"
          :key="tick.value"
          :d="`M${GRID_START} ${gridY(tick.top)} H${GRID_END}`"
          :opacity="tick.opacity"
          fill="none"
          stroke="var(--color-grid)"
          stroke-width="1"
        />
        <path
          v-if="drawn.zero"
          :d="drawn.zero"
          fill="none"
          stroke="var(--color-ctrl-line)"
          stroke-width="1.5"
        />
        <g v-if="drawn.gap" class="motion-safe:animate-draw" :style="LINE_IN">
          <defs>
            <clipPath :id="`${clip}-above`"><path :d="drawn.gap.above" /></clipPath>
            <clipPath :id="`${clip}-below`"><path :d="drawn.gap.below" /></clipPath>
          </defs>
          <path
            :d="drawn.gap.between"
            :clip-path="`url(#${clip}-above)`"
            fill="var(--color-gain)"
            opacity="0.18"
          />
          <path
            :d="drawn.gap.between"
            :clip-path="`url(#${clip}-below)`"
            fill="var(--color-loss)"
            opacity="0.18"
          />
        </g>
        <g
          v-for="line in drawn.lines"
          :key="line.key"
          class="motion-safe:animate-draw"
          :style="LINE_IN"
        >
          <NeonChartSeries
            v-if="!line.dashed"
            :line="line.d"
            :color="line.key === 'benchmark' ? 'var(--color-lilac)' : undefined"
          />
          <path
            v-else
            :d="line.d"
            fill="none"
            stroke="var(--color-faint)"
            stroke-width="1"
            stroke-dasharray="4 4"
            stroke-linejoin="round"
            stroke-linecap="round"
            vector-effect="non-scaling-stroke"
          />
        </g>
        <circle
          v-if="drawn.drop"
          :cx="drawn.drop.x"
          :cy="drawn.drop.y"
          r="6"
          :class="DOT"
          :style="DOT_IN"
          fill="var(--color-bg)"
          stroke="var(--color-loss)"
          stroke-width="2.5"
        />
        <circle
          :cx="drawn.dot.x"
          :cy="drawn.dot.y"
          r="5.5"
          :class="DOT"
          :style="DOT_IN"
          fill="var(--color-text)"
          stroke="var(--color-bg)"
          stroke-width="2.5"
        />
      </svg>
      <span
        v-for="tick in frame.grid"
        :key="tick.value"
        class="text-muted pointer-events-none absolute -translate-x-full -translate-y-1/2 text-xs leading-none font-semibold whitespace-nowrap"
        :style="{
          insetInlineStart: `${AXIS_LABEL_LEFT}%`,
          insetBlockStart: `${tick.top}%`,
          opacity: tick.opacity,
        }"
        aria-hidden="true"
      >
        {{ tick.text }}
      </span>
      <span
        v-for="month in chart.months"
        :key="month.left"
        class="text-muted pointer-events-none absolute inset-bs-[97%] -translate-1/2 text-xs leading-none font-semibold"
        :style="{ insetInlineStart: `${month.left}%` }"
        aria-hidden="true"
      >
        {{ month.text }}
      </span>
      <span
        v-if="drawn.drop"
        class="text-loss pointer-events-none absolute -translate-1/2 text-xs leading-none font-extrabold whitespace-nowrap"
        :class="AFTER_LINE"
        :style="{ insetInlineStart: `${drawn.drop.left}%`, insetBlockStart: `${drawn.drop.top}%` }"
        aria-hidden="true"
      >
        {{ drawn.drop.text }}
      </span>
      <span
        v-for="end in drawn.ends"
        :key="end.tone"
        class="pointer-events-none absolute grid -translate-y-1/2 gap-[3px] leading-none whitespace-nowrap"
        :class="[END_TEXT[end.tone], AFTER_LINE]"
        :style="{ insetInlineStart: `${END_LABEL_LEFT}%`, insetBlockStart: `${end.top}%` }"
        aria-hidden="true"
      >
        <span :key="end.name" class="motion-safe:animate-swap text-xs font-bold">
          {{ end.name }}
        </span>
        <span class="font-display text-figure-row font-semibold tracking-[-0.02em]">
          {{ end.figure }}
        </span>
      </span>
    </div>
  </figure>
</template>

<script setup lang="ts">
import { AXIS_LABEL_LEFT, END_LABEL_LEFT, type PortfolioChart } from './view-model'

// The cover's evolution chart: the portfolio over the period, against what
// went into it (dashed) in euros or over the zero line in TWR, with each line's
// figure written at its end instead of a legend, and the worst fall marked on
// its trough in the TWR view.
defineProps<{ chart: PortfolioChart }>()
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
        <path :d="chart.gridPath" fill="none" stroke="var(--color-grid)" stroke-width="1" />
        <path
          v-if="chart.zero"
          :d="chart.zero"
          fill="none"
          stroke="var(--color-ctrl-line)"
          stroke-width="1.5"
        />
        <path
          v-for="line in chart.lines"
          :key="line.key"
          :d="line.d"
          fill="none"
          :stroke="line.dashed ? 'var(--color-faint)' : 'var(--color-accent)'"
          :stroke-width="line.dashed ? 1 : 2.5"
          :stroke-dasharray="line.dashed ? '4 4' : undefined"
          stroke-linejoin="round"
          stroke-linecap="round"
          vector-effect="non-scaling-stroke"
        />
        <circle
          v-if="chart.drop"
          :cx="chart.drop.x"
          :cy="chart.drop.y"
          r="6"
          fill="var(--color-bg)"
          stroke="var(--color-loss)"
          stroke-width="2.5"
        />
        <circle
          :cx="chart.dot.x"
          :cy="chart.dot.y"
          r="5.5"
          fill="var(--color-text)"
          stroke="var(--color-bg)"
          stroke-width="2.5"
        />
      </svg>
      <span
        v-for="line in chart.grid"
        :key="line.value"
        class="text-muted pointer-events-none absolute -translate-x-full -translate-y-1/2 text-xs leading-none font-semibold whitespace-nowrap"
        :style="{ insetInlineStart: `${AXIS_LABEL_LEFT}%`, insetBlockStart: `${line.top}%` }"
        aria-hidden="true"
      >
        {{ line.text }}
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
        v-if="chart.drop"
        class="text-loss pointer-events-none absolute -translate-1/2 text-xs leading-none font-extrabold whitespace-nowrap"
        :style="{ insetInlineStart: `${chart.drop.left}%`, insetBlockStart: `${chart.drop.top}%` }"
        aria-hidden="true"
      >
        {{ chart.drop.text }}
      </span>
      <span
        v-for="end in chart.ends"
        :key="end.name"
        class="pointer-events-none absolute grid -translate-y-1/2 gap-[3px] leading-none whitespace-nowrap"
        :class="end.tone === 'value' ? 'text-text' : 'text-muted'"
        :style="{ insetInlineStart: `${END_LABEL_LEFT}%`, insetBlockStart: `${end.top}%` }"
        aria-hidden="true"
      >
        <span class="text-xs font-bold">{{ end.name }}</span>
        <span class="font-display text-[16px] font-semibold tracking-[-0.02em]">
          {{ end.figure }}
        </span>
      </span>
    </div>
  </figure>
</template>

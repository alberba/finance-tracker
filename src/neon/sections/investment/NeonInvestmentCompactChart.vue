<script setup lang="ts">
import { useId } from 'vue'

import type { CompactChart } from './view-model'

// The cover's chart on the mobile frame (DESIGN.md, «Gráfico de evolución ·
// Móvil»): edge to edge and 266 px tall, the portfolio as a thick line over an
// area that fades out, what went in as a dashed one, only the months on the
// axis and today's dot. The worst fall, in the TWR view, is marked on its
// trough. No figures beside it: the strip above says them.
defineProps<{ chart: CompactChart }>()

const gradientId = `compact-area-${useId()}`
</script>

<template>
  <figure class="m-0 grid min-w-0 gap-2" data-investment-chart>
    <div class="relative h-[266px] min-w-0">
      <svg
        :viewBox="chart.viewBox"
        preserveAspectRatio="none"
        role="img"
        :aria-label="chart.label"
        class="absolute inset-0 block size-full overflow-visible"
      >
        <defs>
          <linearGradient :id="gradientId" x1="0" y1="0" x2="0" y2="1">
            <stop offset="0" stop-color="var(--color-accent)" stop-opacity="0.42" />
            <stop offset="0.55" stop-color="var(--color-accent)" stop-opacity="0.14" />
            <stop offset="1" stop-color="var(--color-accent)" stop-opacity="0" />
          </linearGradient>
        </defs>
        <path :d="chart.area" :fill="`url(#${gradientId})`" stroke="none" />
        <path
          v-for="line in chart.lines"
          :key="line.key"
          :d="line.d"
          fill="none"
          :stroke="line.dashed ? 'var(--color-faint)' : 'var(--color-accent)'"
          :stroke-width="line.dashed ? 1 : 3"
          :stroke-dasharray="line.dashed ? '4 4' : undefined"
          stroke-linejoin="round"
          stroke-linecap="round"
          vector-effect="non-scaling-stroke"
        />
      </svg>
      <span
        v-if="chart.drop"
        class="border-loss bg-bg pointer-events-none absolute size-3 -translate-1/2 rounded-full border-2"
        :style="{ insetInlineStart: `${chart.drop.left}%`, insetBlockStart: `${chart.drop.top}%` }"
        aria-hidden="true"
      ></span>
      <span
        v-if="chart.drop"
        class="text-loss text-label pointer-events-none absolute -translate-x-1/2 translate-y-2.5 leading-none font-extrabold whitespace-nowrap"
        :style="{ insetInlineStart: `${chart.drop.left}%`, insetBlockStart: `${chart.drop.top}%` }"
        aria-hidden="true"
      >
        {{ chart.drop.text }}
      </span>
      <span
        class="bg-text border-bg pointer-events-none absolute size-3.5 -translate-1/2 rounded-full border-[2.5px]"
        :style="{ insetInlineStart: `${chart.dot.left}%`, insetBlockStart: `${chart.dot.top}%` }"
        aria-hidden="true"
      ></span>
      <span
        v-for="month in chart.months"
        :key="month.left"
        class="text-muted text-label pointer-events-none absolute inset-bs-[calc(100%-26px)] -translate-x-1/2 leading-none font-semibold"
        :style="{ insetInlineStart: `${month.left}%` }"
        aria-hidden="true"
      >
        {{ month.text }}
      </span>
    </div>
    <figcaption
      v-if="chart.hasInvested"
      class="text-muted text-meta flex gap-x-5 px-[clamp(16px,2.6vw,40px)]"
      aria-hidden="true"
    >
      <span class="inline-flex items-center gap-2">
        <span class="bg-accent h-[3px] w-5 rounded-full"></span>
        Tu cartera
      </span>
      <span class="inline-flex items-center gap-2">
        <span class="border-faint w-5 border-t border-dashed"></span>
        Has puesto
      </span>
    </figcaption>
  </figure>
</template>

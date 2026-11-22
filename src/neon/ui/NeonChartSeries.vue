<script setup lang="ts">
import { useId } from 'vue'

// One evolution series inside a chart's <svg> (DESIGN.md, «Gráfico de
// evolución»): the line and, when `area` is given, the gradient that fades under
// it. Every evolution chart draws its main series through here so they all look
// alike; the chart keeps its grid, axes, dots and secondary lines.
withDefaults(
  defineProps<{
    /** `M x y L x y …` in the chart's view box. */
    line: string
    /** The line closed along the bottom; without it the series has no fill. */
    area?: string
    color?: string
  }>(),
  { area: '', color: 'var(--color-accent)' },
)

const gradientId = `series-${useId()}`
</script>

<template>
  <g>
    <defs>
      <linearGradient :id="gradientId" x1="0" y1="0" x2="0" y2="1">
        <stop offset="0" :stop-color="color" stop-opacity="0.42" />
        <stop offset="0.55" :stop-color="color" stop-opacity="0.14" />
        <stop offset="1" :stop-color="color" stop-opacity="0" />
      </linearGradient>
    </defs>
    <path v-if="area" :d="area" :fill="`url(#${gradientId})`" stroke="none" />
    <path
      :d="line"
      fill="none"
      :stroke="color"
      stroke-width="2.5"
      stroke-linecap="round"
      stroke-linejoin="round"
      vector-effect="non-scaling-stroke"
    />
  </g>
</template>

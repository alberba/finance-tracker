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
    /** The last segment, dashed while its value is provisional. */
    tail?: string
    /** The line closed along the bottom; without it the series has no fill. */
    area?: string
    color?: string
  }>(),
  { area: '', tail: '', color: 'var(--color-accent)' },
)

const gradientId = `series-${useId()}`
</script>

<template>
  <g>
    <defs>
      <linearGradient :id="gradientId" x1="0" y1="0" x2="0" y2="1">
        <!-- A light veil, set per theme by --area-opacity: the line carries the
             data and the fill only says which side is below it. -->
        <stop
          offset="0"
          :stop-color="color"
          style="stop-opacity: calc(var(--area-opacity, 0.14) * 1.5)"
        />
        <stop
          offset="0.6"
          :stop-color="color"
          style="stop-opacity: calc(var(--area-opacity, 0.14) * 0.5)"
        />
        <stop offset="1" :stop-color="color" stop-opacity="0" />
      </linearGradient>
    </defs>
    <path v-if="area" :d="area" :fill="`url(#${gradientId})`" stroke="none" />
    <path
      v-for="segment in [{ path: line, dashed: false }, { path: tail, dashed: true }].filter(({ path }) => path)"
      :key="String(segment.dashed)"
      :d="segment.path"
      fill="none"
      :stroke="color"
      stroke-width="2"
      stroke-linecap="round"
      stroke-linejoin="round"
      :stroke-dasharray="segment.dashed ? '4 4' : undefined"
      vector-effect="non-scaling-stroke"
    />
  </g>
</template>

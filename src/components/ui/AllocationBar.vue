<script setup lang="ts">
import { computed } from 'vue'

import { formatPercent } from '../../lib/format'

export interface AllocationSegment {
  id: string
  label: string
  /** Share of the whole, 0–100. */
  weight: number
  /** A color or a token reference; a data value, so it goes inline. */
  color: string
  /** Secondary figure in the tooltip, e.g. the formatted amount. */
  detail?: string
}

// A single bar split by share. Each segment is focusable (Tab, or a tap on
// touch screens) and names its share; the tooltip shows on hover or focus.
const props = defineProps<{
  segments: AllocationSegment[]
  label: string
}>()

// Tooltips near the edges anchor to that edge so they never leave the page.
const placed = computed(() => {
  let start = 0
  return props.segments.map((segment) => {
    const end = start + segment.weight
    const anchor = start < 25 ? 'left-0' : end > 75 ? 'right-0' : 'left-1/2 -translate-x-1/2'
    start = end
    const share = formatPercent(segment.weight, { digits: 1 })
    const name = [share, segment.detail].filter(Boolean).join(', ')
    return { ...segment, anchor, share, name: `${segment.label}: ${name}` }
  })
})
</script>

<template>
  <div class="flex gap-0.5" role="list" :aria-label="label">
    <span
      v-for="segment in placed"
      :key="segment.id"
      class="group focus-visible:outline-primary relative min-w-1 rounded-xs py-2 focus-visible:outline-2"
      role="listitem"
      tabindex="0"
      :aria-label="segment.name"
      :style="{ flexGrow: segment.weight }"
      :data-segment="segment.id"
    >
      <span
        class="block h-2.5 rounded-xs transition-transform group-first:rounded-l-full group-last:rounded-r-full group-hover:scale-y-125 group-focus:scale-y-125 sm:h-3.5"
        :style="{ background: segment.color }"
      ></span>
      <span
        class="bg-ink text-ink-text shadow-pop absolute bottom-full z-10 mb-0.5 hidden flex-col gap-1 rounded-md px-3.5 py-3 whitespace-nowrap group-hover:flex group-focus:flex"
        :class="segment.anchor"
        aria-hidden="true"
        data-segment-tip
      >
        <span class="flex items-center gap-2 text-sm font-semibold">
          <span class="size-2.5 rounded-xs" :style="{ background: segment.color }"></span>
          {{ segment.label }}
        </span>
        <span class="flex items-baseline gap-2.5">
          <span class="font-display text-2xl font-bold tabular-nums">{{ segment.share }}</span>
          <span v-if="segment.detail" class="font-display text-ink-muted text-sm tabular-nums">
            {{ segment.detail }}
          </span>
        </span>
      </span>
    </span>
  </div>
</template>

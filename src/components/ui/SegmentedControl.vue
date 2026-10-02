<script setup lang="ts" generic="T extends string">
export interface SegmentedOption<V extends string = string> {
  value: V
  label: string
  /** Accessible name when the label alone is not enough (e.g. "€"). */
  ariaLabel?: string
}

// A few mutually exclusive choices as toggle buttons (aria-pressed). `solid`
// marks the active option in ink; `soft` sits on a subtle track.
const props = withDefaults(
  defineProps<{
    options: SegmentedOption<T>[]
    label: string
    variant?: 'solid' | 'soft'
    /** Also exposes each option value as `data-${dataKey}`, for tests and scripts. */
    dataKey?: string
  }>(),
  { variant: 'solid', dataKey: undefined },
)

const selected = defineModel<T>({ required: true })

function dataAttrs(option: SegmentedOption<T>): Record<string, string> {
  return props.dataKey ? { [`data-${props.dataKey}`]: option.value } : {}
}

const TRACK = {
  solid: 'bg-panel border border-line',
  soft: 'bg-subtle',
} as const
const ACTIVE = {
  solid: 'bg-text-main text-panel',
  soft: 'bg-panel text-text-main shadow-card',
} as const
</script>

<template>
  <div class="flex gap-0.5 rounded-md p-1" :class="TRACK[variant]" role="group" :aria-label="label">
    <button
      v-for="option in options"
      :key="option.value"
      type="button"
      class="focus-visible:outline-primary h-9 min-w-11 rounded-sm px-3.5 text-sm font-bold transition-colors focus-visible:outline-2 focus-visible:outline-offset-2"
      :class="
        selected === option.value ? ACTIVE[variant] : 'text-text-muted hover:text-text-main'
      "
      :aria-pressed="selected === option.value"
      :aria-label="option.ariaLabel"
      v-bind="dataAttrs(option)"
      @click="selected = option.value"
    >
      {{ option.label }}
    </button>
  </div>
</template>

<script setup lang="ts">
import { computed } from 'vue'

import { splitDecimals } from '../../lib/format'
import KickerLabel from './KickerLabel.vue'
import { INK_TONE_TEXT, type Tone } from './tone'

export interface InkBandFact {
  label: string
  value: string
  tone?: Tone
  labelId?: string
  valueId?: string
}

// The dark band that carries a screen's headline figure: the figure large
// (decimals smaller), an optional change chip and up to three facts beside it.
// The `label` slot replaces the label (e.g. with month arrows); `note` adds a
// line under the figure.
const props = defineProps<{
  label: string
  /** Formatted figure; its decimals and currency render smaller. */
  value: string
  ariaLabel: string
  valueId?: string
  chip?: { text: string; tone: Tone } | null
  facts?: InkBandFact[]
}>()

const parts = computed(() => splitDecimals(props.value))
</script>

<template>
  <section
    class="bg-ink border-ink-line text-ink-text grid gap-5 rounded-lg border px-5 py-6 sm:px-9 sm:py-8 lg:flex lg:items-end lg:gap-0"
    :aria-label="ariaLabel"
  >
    <div class="grid gap-2.5 lg:flex-[1.6] lg:pr-8">
      <slot name="label">
        <KickerLabel tone="ink">{{ label }}</KickerLabel>
      </slot>
      <p
        :id="valueId"
        class="font-display leading-none font-bold tracking-tight whitespace-nowrap tabular-nums"
      >
        <span class="text-5xl lg:text-6xl">{{ parts.whole }}</span
        ><span class="text-ink-muted text-2xl lg:text-3xl">{{ parts.rest }}</span>
      </p>
      <slot name="note" />
      <p v-if="chip" class="flex">
        <span
          class="bg-ink-text/10 font-display rounded-full px-2.5 py-0.5 text-sm font-medium tabular-nums"
          :class="INK_TONE_TEXT[chip.tone]"
          data-ink-chip
        >
          {{ chip.text }}
        </span>
      </p>
    </div>
    <div
      v-if="facts?.length"
      class="border-ink-text/10 grid grid-cols-3 border-t pt-4 lg:flex lg:flex-[3] lg:border-t-0 lg:pt-0"
    >
      <div
        v-for="fact in facts"
        :key="fact.label"
        class="border-ink-text/10 grid min-w-0 content-end gap-1.5 border-l pl-3 first:border-l-0 first:pl-0 lg:flex-1 lg:px-6 lg:first:border-l lg:first:pl-6 lg:last:pr-0"
      >
        <p :id="fact.labelId" class="text-ink-muted text-xs sm:text-sm">{{ fact.label }}</p>
        <p
          :id="fact.valueId"
          class="font-display text-sm font-medium tabular-nums sm:text-2xl"
          :class="fact.tone ? INK_TONE_TEXT[fact.tone] : undefined"
        >
          {{ fact.value }}
        </p>
      </div>
    </div>
  </section>
</template>

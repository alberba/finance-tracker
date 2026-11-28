<script setup lang="ts">
import type { Tone } from '../../../lib/tone'
import type { Bar } from './year-view-model'

// Compliance bar of the year screen: what is within the budget, the excess
// over it (loss for spending, gain for income) and a tick where the budget
// sits. Decorative: the figures beside it say the same in text.
defineProps<{ bar: Bar; excess?: Tone; large?: boolean }>()
</script>

<template>
  <span class="bg-line rounded-pill relative block h-1.5 w-full" aria-hidden="true" data-budget-bar>
    <span
      class="bg-neutral-bar absolute inset-y-0 left-0 rounded-s-full"
      :style="{ width: `${bar.fill}%` }"
    ></span>
    <span
      class="absolute inset-y-0"
      :class="excess === 'gain' ? 'bg-gain' : 'bg-loss'"
      :style="{ left: `${bar.fill}%`, width: `${bar.over}%` }"
    ></span>
    <span
      class="bg-text absolute w-0.5 -translate-x-1/2 rounded-xs"
      :class="large ? '-inset-y-[5px]' : '-inset-y-1'"
      :style="{ left: `${bar.tick}%` }"
    ></span>
  </span>
</template>

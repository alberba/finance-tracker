<script setup lang="ts">
import type { StatusTone } from '../../domain/investment/quote-status'

// A colored dot with its label; the label carries the meaning, the dot only
// reinforces it.
defineProps<{ tone: StatusTone; label: string }>()

const DOT: Record<StatusTone, string> = {
  gain: 'bg-income',
  warn: 'bg-accent',
  loss: 'bg-expense',
}
</script>

<template>
  <span class="inline-flex items-center gap-2" :data-status-tone="tone">
    <span class="size-2 shrink-0 rounded-full" :class="DOT[tone]" aria-hidden="true"></span>
    <slot>{{ label }}</slot>
  </span>
</template>

<script setup lang="ts">
// A short tag beside a name: the operation (Compra/Venta), a currency, a
// "manual" mark, a goal met. The text carries the meaning; the tone only sets it apart.
withDefaults(defineProps<{ tone?: 'neutral' | 'invest' | 'accent' | 'gain' }>(), {
  tone: 'neutral',
})

const TONE = {
  neutral: 'border-line-strong text-text-muted border',
  invest: 'bg-invest/12 text-invest',
  accent: 'bg-accent/15 text-text-main',
  gain: 'bg-gain/10 text-gain',
} as const
</script>

<template>
  <span
    class="inline-flex items-center rounded-sm px-2 py-0.5 text-xs font-bold whitespace-nowrap"
    :class="TONE[tone]"
    :data-tone="tone"
  >
    <slot />
  </span>
</template>

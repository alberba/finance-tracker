<script setup lang="ts">
// Progress bar of the new design (DESIGN.md, Barra de progreso): a 6px track
// with a neutral fill, which only turns to loss when it goes over the limit.
defineProps<{
  /** Share filled, 0–100. */
  value: number
  over?: boolean
}>()
</script>

<template>
  <span class="bg-line rounded-pill block h-1.5 overflow-hidden" aria-hidden="true">
    <span
      class="rounded-pill block h-full"
      :class="over ? 'bg-loss' : 'bg-neutral-bar'"
      :style="{ width: `${value}%` }"
    />
  </span>
</template>

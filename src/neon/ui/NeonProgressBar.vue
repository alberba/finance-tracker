<script setup lang="ts">
// Progress bar (DESIGN.md, Barra de progreso): a 6px track
// with a neutral fill, which only turns to loss when it goes over the limit.
// The fill draws itself up to its value when it first shows (`anim-wipe`),
// after `delay` ms so the bars of a list arrive one after another, and slides
// to a new value when it changes.
withDefaults(
  defineProps<{
    /** Share filled, 0–100. */
    value: number
    over?: boolean
    delay?: number
  }>(),
  { delay: 200 },
)
</script>

<template>
  <span class="bg-line rounded-pill block h-1.5 overflow-hidden" aria-hidden="true">
    <span
      class="rounded-pill motion-safe:animate-wipe block h-full motion-safe:transition-[width,background-color] motion-safe:duration-500 motion-safe:ease-out"
      :class="over ? 'bg-loss' : 'bg-neutral-bar'"
      :style="{ width: `${value}%`, animationDelay: `${delay}ms` }"
    />
  </span>
</template>

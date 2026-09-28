<script setup lang="ts">
// Top of a section: kicker, title and a one-line lede, with an optional aside
// (status, primary action) aligned to the right.
defineProps<{
  kicker: string
  title: string
  titleId: string
  lede?: string
}>()
</script>

<template>
  <header class="flex flex-wrap items-end justify-between gap-x-6 gap-y-3">
    <div class="grid gap-2">
      <p class="text-primary font-mono text-xs tracking-[0.16em] uppercase">{{ kicker }}</p>
      <h2
        :id="titleId"
        class="font-display text-text-main text-3xl leading-tight font-bold tracking-tight sm:text-4xl"
      >
        {{ title }}
      </h2>
      <p v-if="lede" class="text-text-muted text-base">{{ lede }}</p>
    </div>
    <div v-if="$slots.aside">
      <slot name="aside" />
    </div>
  </header>
</template>

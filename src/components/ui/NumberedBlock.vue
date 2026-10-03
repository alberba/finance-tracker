<script setup lang="ts">
// A numbered block of a document surface: "01 Title", its description, an
// optional actions slot on the right and the body below.
defineProps<{
  number: string
  title: string
  titleId: string
  description?: string
}>()
</script>

<template>
  <section class="grid min-w-0 gap-5 py-6 sm:py-8" :aria-labelledby="titleId">
    <header class="flex flex-wrap items-start justify-between gap-x-6 gap-y-3">
      <div class="flex items-baseline gap-3.5">
        <span
          class="font-display text-primary text-xs font-medium tracking-[0.08em] tabular-nums"
          aria-hidden="true"
        >
          {{ number }}
        </span>
        <div class="grid gap-1.5">
          <h3 :id="titleId" class="font-display text-text-main text-xl font-bold tracking-tight">
            {{ title }}
          </h3>
          <p v-if="description || $slots.description" class="text-text-muted text-sm sm:text-base">
            <slot name="description">{{ description }}</slot>
          </p>
        </div>
      </div>
      <div v-if="$slots.actions">
        <slot name="actions" />
      </div>
    </header>
    <slot />
  </section>
</template>

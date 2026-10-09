<script setup lang="ts">
// One block of the dashboard's grid: "01 · PATRIMONIO" above its title, an
// optional description and actions, and the body below. The grid draws the
// rules between blocks; `subtle` gives the block a tinted background.
withDefaults(
  defineProps<{
    kicker: string
    title: string
    titleId: string
    description?: string
    subtle?: boolean
  }>(),
  { description: undefined, subtle: false },
)
</script>

<template>
  <section
    class="border-line flex min-w-0 flex-col gap-5 px-4 py-6 sm:px-7 sm:py-7"
    :class="{ 'bg-subtle': subtle }"
    :aria-labelledby="titleId"
  >
    <header class="flex flex-wrap items-end justify-between gap-x-4 gap-y-2">
      <div class="grid gap-1.5">
        <p
          class="font-mono text-xs tracking-widest"
          :class="subtle ? 'text-text-muted' : 'text-primary'"
        >
          {{ kicker }}
        </p>
        <h3
          :id="titleId"
          class="font-display text-text-main flex items-center gap-2.5 text-xl font-bold tracking-tight"
        >
          {{ title }}<slot name="badge" />
        </h3>
        <p v-if="description" class="font-display text-text-muted text-sm tabular-nums">
          {{ description }}
        </p>
      </div>
      <slot name="actions" />
    </header>
    <slot />
  </section>
</template>

<script setup lang="ts">
// Kicker + title + optional description at the top of a panel. The title goes
// in the default slot so it can carry inline markup (counts, badges).
defineProps<{
  kicker: string
  description?: string
}>()
</script>

<template>
  <div>
    <p class="text-primary font-mono text-[0.65rem] tracking-[0.18em] uppercase">{{ kicker }}</p>
    <h3 class="font-display text-text-main text-xl tracking-normal normal-case"><slot /></h3>
    <p v-if="description" class="text-text-muted text-sm">{{ description }}</p>
  </div>
</template>

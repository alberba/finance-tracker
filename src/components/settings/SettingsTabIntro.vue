<script setup lang="ts">
import BaseButton from '../ui/BaseButton.vue'

// Top of a Configuración tab: what the tab holds and, when it creates
// something, its one primary action.
defineProps<{
  title: string
  description: string
  /** Label of the primary action; none when the tab creates nothing. */
  action?: string
}>()

defineEmits<{ action: [] }>()
</script>

<template>
  <div class="flex flex-wrap items-end justify-between gap-4">
    <div class="grid gap-1.5">
      <h3 class="font-display text-text-main text-2xl font-bold tracking-tight">{{ title }}</h3>
      <p class="text-text-muted text-[0.9375rem]">{{ description }}</p>
    </div>
    <BaseButton v-if="action" variant="primary" class="max-sm:w-full" @click="$emit('action')">
      <svg
        class="size-4.5"
        viewBox="0 0 24 24"
        fill="none"
        stroke="currentColor"
        stroke-width="2.2"
        stroke-linecap="round"
        aria-hidden="true"
      >
        <path d="M12 5v14M5 12h14" />
      </svg>
      {{ action }}
    </BaseButton>
  </div>
</template>

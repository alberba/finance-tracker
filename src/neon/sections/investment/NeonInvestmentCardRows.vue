<script setup lang="ts">
import { TONE_TEXT, type CardRow } from './view-model'

// The rows of a card under the positions: a label and its figure, one line each.
defineProps<{ rows: readonly CardRow[] }>()
</script>

<template>
  <ul class="m-0 list-none p-0">
    <li
      v-for="row in rows"
      :key="row.label"
      class="border-line flex items-baseline justify-between gap-3 border-t py-2.5"
    >
      <span class="text-row font-bold">{{ row.label }}</span>
      <span
        class="font-display text-figure-row flex-none font-semibold whitespace-nowrap tabular-nums"
        :class="TONE_TEXT[row.tone]"
      >
        {{ row.value }}
      </span>
    </li>
  </ul>
</template>

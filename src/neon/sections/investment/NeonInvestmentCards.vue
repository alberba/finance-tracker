<script setup lang="ts">
import NeonCard from '../../ui/NeonCard.vue'
import { TONE_TEXT, type Card } from './view-model'

// The two figure cards under the positions: the worst fall and the fees. They
// share a row when there is room and stack when there isn't.
defineProps<{ cards: readonly Card[] }>()
</script>

<template>
  <div
    class="grid min-w-0 grid-cols-[repeat(auto-fit,minmax(min(100%,340px),1fr))] gap-x-14 gap-y-8 @max-lg:gap-y-5"
  >
    <NeonCard v-for="card in cards" :key="card.id" :title="card.title" :title-id="card.id">
      <ul class="m-0 list-none p-0">
        <li
          v-for="row in card.rows"
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
    </NeonCard>
  </div>
</template>

<script setup lang="ts">
import NeonCard from '../../ui/NeonCard.vue'
import NeonInvestmentCardRows from './NeonInvestmentCardRows.vue'
import type { Card } from './view-model'

// The two figure cards under the positions: the worst fall and the fees. They
// share a row when there is room and stack when there isn't.
defineProps<{ cards: readonly Card[] }>()
</script>

<template>
  <div
    class="grid min-w-0 grid-cols-[repeat(auto-fit,minmax(min(100%,340px),1fr))] gap-x-14 gap-y-8"
  >
    <NeonCard v-for="card in cards" :key="card.id" :title="card.title" :title-id="card.id">
      <NeonInvestmentCardRows :rows="card.rows" />
    </NeonCard>
  </div>
</template>

<script setup lang="ts">
import type { Breakdown } from './registry-view-model'

// The split by category of what the filters leave in the month: one row per
// category with its amount, its share and a neutral bar (DESIGN.md «Barra de
// progreso»). The summary shows it inline on the desktop frame and in a sheet
// on the mobile one.
defineProps<{ breakdown: Breakdown }>()
</script>

<template>
  <ul v-if="breakdown.rows.length" class="grid gap-3.5" data-tx-breakdown>
    <li v-for="row in breakdown.rows" :key="row.name" class="grid min-w-0 gap-[7px]">
      <div class="flex min-w-0 items-baseline justify-between gap-3 text-[15px]">
        <span class="min-w-0 truncate font-semibold">{{ row.name }}</span>
        <span class="font-bold whitespace-nowrap tabular-nums">
          {{ row.amount }}
          <span class="text-muted text-[13px] font-semibold">{{ row.share }}</span>
        </span>
      </div>
      <div class="bg-line rounded-pill h-1.5 overflow-hidden" aria-hidden="true">
        <span
          class="bg-neutral-bar rounded-pill block h-full"
          :style="{ width: `${row.width}%` }"
        ></span>
      </div>
    </li>
  </ul>
  <p v-else class="text-muted text-[14px]">Nada que sumar con estos filtros.</p>
</template>

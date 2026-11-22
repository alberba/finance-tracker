<script setup lang="ts">
import { OPERATION_ICONS } from './asset-icons'
import type { AssetYear } from './asset-view-model'

// The operations of an asset by year, newest first: each year with what was
// bought and sold in it, and a row per movement (the icon of the operation,
// what it was, the day and the fee; the total, and the units at their price).
// The desktop detail and the mobile movements screen share it.
defineProps<{ years: readonly AssetYear[] }>()
</script>

<template>
  <p v-if="!years.length" class="text-muted text-note m-0">Aún no hay operaciones apuntadas.</p>
  <div v-for="year in years" :key="year.year" class="grid gap-1" data-asset-year>
    <div class="mt-3.5 flex items-baseline justify-between gap-x-5 gap-y-0.5">
      <h3 class="text-muted text-label tracking-label m-0 flex-none font-extrabold uppercase">
        {{ year.year }}
      </h3>
      <span class="text-muted text-meta min-w-0 truncate font-bold tabular-nums">
        {{ year.sum }}
      </span>
    </div>
    <ul class="m-0 list-none p-0">
      <li
        v-for="row in year.rows"
        :key="row.id"
        class="border-line grid min-h-16 grid-cols-[auto_minmax(0,1fr)_auto] items-center gap-x-3.5 border-t py-2.5 [grid-template-areas:'i_o_t'_'i_d_q'_'i_f_q']"
        :data-asset-movement="row.id"
      >
        <span
          class="flex items-center self-center [grid-area:i]"
          :class="row.side === 'sell' ? 'text-soft' : 'text-text'"
          aria-hidden="true"
        >
          <svg
            class="size-7"
            viewBox="0 0 24 24"
            fill="none"
            stroke="currentColor"
            stroke-width="2"
            stroke-linecap="round"
            stroke-linejoin="round"
          >
            <path :d="OPERATION_ICONS[row.side ?? 'other']" />
          </svg>
        </span>
        <span
          class="text-note min-w-0 truncate font-bold [grid-area:o]"
          :class="row.side === 'sell' ? 'text-soft' : 'text-text'"
        >
          {{ row.operation }}
        </span>
        <span class="text-muted text-note font-bold whitespace-nowrap tabular-nums [grid-area:d]">
          {{ row.day }}
        </span>
        <span
          v-if="row.fee"
          class="text-muted text-meta whitespace-nowrap tabular-nums [grid-area:f]"
        >
          {{ row.fee }}
        </span>
        <span
          v-if="row.quantity"
          class="text-muted text-meta text-end font-bold whitespace-nowrap tabular-nums [grid-area:q]"
        >
          {{ row.quantity }}
        </span>
        <span
          class="font-display text-figure-row text-end font-semibold whitespace-nowrap tabular-nums [grid-area:t]"
        >
          {{ row.total }}
        </span>
      </li>
    </ul>
  </div>
</template>

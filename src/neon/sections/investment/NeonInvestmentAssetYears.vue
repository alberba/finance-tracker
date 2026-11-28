<script setup lang="ts">
import { OPERATION_ICONS } from './asset-icons'
import type { AssetYear } from './asset-view-model'

// The operations of an asset by year, newest first: each year with what was
// bought and sold in it, and a row per movement. The day leads (in a run of
// monthly buys it is what tells one row from the next); then the operation and its units at their price, the fee only
// when one was charged, and the total. Wide, a row is one line; narrow (the
// mobile movements screen), the operation goes under the day and the fee under
// the total.
defineProps<{ years: readonly AssetYear[] }>()
</script>

<template>
  <div class="@container/moves grid min-w-0">
    <p v-if="!years.length" class="text-muted text-note m-0">Aún no hay operaciones apuntadas.</p>
    <div v-for="year in years" :key="year.year" class="grid" data-asset-year>
      <div
        class="flex items-baseline justify-between gap-x-5 gap-y-0.5 pbe-2 [&:not(:first-child)]:mbs-4"
      >
        <h3 class="text-muted text-meta m-0 flex-none font-extrabold">{{ year.year }}</h3>
        <span class="text-muted text-meta min-w-0 truncate font-bold tabular-nums">
          {{ year.sum }}
        </span>
      </div>
      <ul class="m-0 list-none p-0">
        <li
          v-for="row in year.rows"
          :key="row.id"
          class="border-line grid min-h-14 grid-cols-[auto_minmax(0,1fr)_auto] items-center gap-x-3.5 gap-y-0.5 border-bs py-2.5 [grid-template-areas:'i_d_t'_'i_m_f'] @xl/moves:grid-cols-[auto_4.5rem_minmax(0,1fr)_auto_auto] @xl/moves:gap-x-5 @xl/moves:[grid-template-areas:'i_d_m_f_t']"
          :data-asset-movement="row.id"
        >
          <span
            class="bg-panel2 grid size-8 place-items-center rounded-full [grid-area:i]"
            :class="row.side === 'sell' ? 'text-soft' : 'text-text'"
            aria-hidden="true"
          >
            <svg
              class="size-[18px]"
              viewBox="0 0 24 24"
              fill="none"
              stroke="currentColor"
              stroke-width="2.2"
              stroke-linecap="round"
              stroke-linejoin="round"
            >
              <path :d="OPERATION_ICONS[row.side ?? 'other']" />
            </svg>
          </span>
          <span class="text-row font-bold tabular-nums [grid-area:d]">
            {{ row.day }}
          </span>
          <span class="text-meta text-muted min-w-0 truncate font-bold tabular-nums [grid-area:m]">
            <span :class="row.side === 'sell' ? 'text-soft font-extrabold' : undefined">
              {{ row.operation }}
            </span>
            <template v-if="row.quantity"> · {{ row.quantity }}</template>
          </span>
          <span
            v-if="row.feeCharged"
            class="text-muted text-meta text-end font-bold whitespace-nowrap tabular-nums [grid-area:f]"
          >
            {{ row.fee }}
          </span>
          <span
            class="font-display text-figure-row text-end font-semibold whitespace-nowrap tabular-nums [grid-area:t]"
          >
            {{ row.total }}
          </span>
        </li>
      </ul>
    </div>
  </div>
</template>

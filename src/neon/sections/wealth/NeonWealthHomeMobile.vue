<script setup lang="ts">
import { storeToRefs } from 'pinia'
import { computed } from 'vue'

import { formatMoney } from '../../../lib/format'
import NeonEmptyState from '../../ui/NeonEmptyState.vue'
import NeonWealthAccountDetail from './NeonWealthAccountDetail.vue'
import { ACCOUNT_FILTERS, mobileAccountGroups } from './mobile-view-model'
import { useWealthCover } from './wealth-cover'
import { useNeonWealthScreens } from './wealth-screens'

// Cover of Patrimonio in the mobile frame: what you have, with the
// month's close beside it, then every account as a tile, group by group with
// its total, filtered by group. A tile gives what the account holds and what it
// moved since the month before, coloured only when the move is big. The chart
// and the split stay on the desktop cover. An account opens its sheet; the
// visible title is in the top bar (NeonBarTitle), the heading here is for
// screen readers and focus.
const {
  month,
  monthLower,
  view,
  needsAccount,
  totals,
  card,
  openMonths,
  shownAccount,
  detailOpen,
  showAccount,
} = useWealthCover()
const { filter } = storeToRefs(useNeonWealthScreens())

// «Cerrar marzo» while the month is open; once closed the same button reviews it.
const closeLabel = computed(() =>
  card.value.action.startsWith('Cerrar') ? card.value.action : `Revisar ${monthLower.value}`,
)
/** The net worth split so the cents read smaller: «20.232» and «,35 €». */
const net = computed(() => {
  const text = formatMoney(totals.value.net)
  const comma = text.lastIndexOf(',')
  return comma < 0
    ? { whole: text, rest: '' }
    : { whole: text.slice(0, comma), rest: text.slice(comma) }
})
const groups = computed(() => mobileAccountGroups(view.value, month.value, filter.value))

const PRESS =
  'outline-accent focus-visible:outline-2 focus-visible:outline-offset-2 motion-safe:transition-transform motion-safe:duration-160 motion-safe:ease-out motion-safe:active:scale-[0.97]'
const TONE = { gain: 'text-gain', loss: 'text-loss', muted: 'text-muted' } as const
</script>

<template>
  <div class="grid min-w-0 gap-5">
    <h1 id="wealth-title" tabindex="-1" class="sr-only">Patrimonio</h1>

    <NeonEmptyState v-if="needsAccount" role="status">
      Crea una cuenta de efectivo, inversión o pasivo en Configuración para ver tu patrimonio.
    </NeonEmptyState>

    <template v-else>
      <div class="motion-safe:animate-rise flex items-end justify-between gap-3">
        <p class="grid min-w-0">
          <span class="text-muted text-meta font-bold">Tienes</span>
          <span
            class="font-display text-[28px] leading-[1.1] font-bold tracking-[-0.04em] whitespace-nowrap tabular-nums"
            data-wealth-net
            >{{ net.whole }}<span class="text-muted text-[0.5em]">{{ net.rest }}</span></span
          >
        </p>
        <button
          type="button"
          class="bg-accent text-on-accent font-display rounded-pill inline-flex min-h-11 flex-none items-center gap-1.5 px-3.5 text-[12.5px] font-bold"
          :class="PRESS"
          @click="openMonths('close')"
        >
          <svg
            class="size-[18px] shrink-0"
            viewBox="0 0 24 24"
            fill="none"
            stroke="currentColor"
            stroke-width="2"
            stroke-linecap="round"
            stroke-linejoin="round"
            aria-hidden="true"
          >
            <path d="M4 6h16v14H4zM4 10h16M8 3v4M16 3v4M9 15l2 2 4-4" />
          </svg>
          {{ closeLabel }}
        </button>
      </div>

      <div
        role="group"
        aria-label="Filtrar cuentas"
        class="bg-panel2 rounded-pill motion-safe:animate-rise grid grid-flow-col gap-1 p-1 motion-safe:[animation-delay:50ms]"
      >
        <button
          v-for="option in ACCOUNT_FILTERS"
          :key="option.value"
          type="button"
          :aria-pressed="filter === option.value"
          class="rounded-pill min-h-9 min-w-0 px-1.5 text-[13px] font-extrabold pointer-coarse:min-h-11"
          :class="[PRESS, filter === option.value ? 'bg-panel text-text' : 'text-muted']"
          @click="filter = option.value"
        >
          {{ option.label }}
        </button>
      </div>

      <p v-if="groups.length === 0" class="text-muted text-meta px-0.5 font-bold" role="status">
        No tienes cuentas en este grupo.
      </p>
      <section
        v-for="group in groups"
        :key="group.kind"
        :aria-labelledby="`wealth-group-${group.kind}`"
        class="motion-safe:animate-rise grid min-w-0 gap-2.5 motion-safe:[animation-delay:100ms]"
      >
        <h2
          :id="`wealth-group-${group.kind}`"
          class="flex items-baseline justify-between gap-3 px-0.5 text-[15px] font-extrabold"
        >
          {{ group.title }}
          <span class="font-display text-[15px] font-semibold tabular-nums">{{ group.total }}</span>
        </h2>
        <ul class="grid grid-cols-2 gap-1.5">
          <li v-for="tile in group.tiles" :key="`${tile.kind}-${tile.id}`" class="grid min-w-0">
            <button
              type="button"
              class="bg-panel text-text grid min-h-[86px] min-w-0 content-start gap-0.5 rounded-[16px] px-3 pbs-3 pbe-2.5 text-start"
              :class="PRESS"
              :aria-label="tile.aria"
              @click="showAccount(tile.kind, tile.id)"
            >
              <span class="text-soft truncate text-[13px] font-bold">{{ tile.name }}</span>
              <span
                class="font-display mbs-1 text-[18px] font-semibold tracking-[-0.02em] whitespace-nowrap tabular-nums"
                :class="tile.empty ? 'text-muted' : 'text-text'"
                >{{ tile.value }}</span
              >
              <span
                v-if="tile.change"
                class="text-[12.5px] font-bold tabular-nums"
                :class="TONE[tile.change.tone]"
                >{{ tile.change.text }}</span
              >
            </button>
          </li>
        </ul>
      </section>

      <button
        type="button"
        class="text-soft rounded-pill inline-flex min-h-12 items-center justify-center gap-1 font-extrabold"
        :class="PRESS"
        @click="openMonths('history')"
      >
        Balance por meses
        <svg
          class="size-4"
          viewBox="0 0 24 24"
          fill="none"
          stroke="currentColor"
          stroke-width="2"
          stroke-linecap="round"
          stroke-linejoin="round"
          aria-hidden="true"
        >
          <path d="M9 6l6 6-6 6" />
        </svg>
      </button>
    </template>

    <NeonWealthAccountDetail
      v-model:open="detailOpen"
      :view="view"
      :target="shownAccount"
      :month="month"
    />
  </div>
</template>

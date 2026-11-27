<script setup lang="ts">
import type { SnapshotKind } from '../../../scripts/types'
import NeonButton from '../../ui/NeonButton.vue'
import NeonEmptyState from '../../ui/NeonEmptyState.vue'
import NeonWealthAccountPopover from './NeonWealthAccountPopover.vue'
import NeonWealthBalanceBar from './NeonWealthBalanceBar.vue'
import NeonWealthEvolution from './NeonWealthEvolution.vue'
import NeonWealthHoldings from './NeonWealthHoldings.vue'
import NeonWealthMix from './NeonWealthMix.vue'
import { useWealthCover } from './wealth-cover'

// The cover of the new Patrimonio: the title with the month's close beside it,
// the balance of the month as one bar, how the net worth went this year next to
// where the assets are, and what you have, group by group. A row opens that
// account's detail.
const {
  year,
  currency,
  month,
  view,
  needsAccount,
  totals,
  status,
  card,
  chart,
  mix,
  groups,
  range,
  openMonths,
  shownAccount,
  detailOpen,
  showAccount,
} = useWealthCover()

// The same row closes its popover; another one moves it there.
function toggleAccount(kind: SnapshotKind, id: string): void {
  const shown = shownAccount.value
  if (detailOpen.value && shown?.kind === kind && shown.id === id) detailOpen.value = false
  else showAccount(kind, id)
}
</script>

<template>
  <header class="motion-safe:animate-rise flex flex-wrap items-end justify-between gap-x-6 gap-y-4">
    <div class="grid min-w-0 gap-1">
      <h1
        id="wealth-title"
        tabindex="-1"
        class="font-display text-[clamp(30px,3.2cqi,44px)] leading-[1.1] font-bold tracking-[-0.03em] outline-none"
      >
        Patrimonio
      </h1>
    </div>
    <div v-if="!needsAccount" class="flex flex-wrap items-center gap-x-[18px] gap-y-2">
      <span
        class="text-soft text-note flex items-center gap-2 font-bold whitespace-nowrap"
        data-wealth-status
      >
        <span
          class="size-2 rounded-full border-[1.5px]"
          :class="status.closed ? 'border-text bg-text' : 'border-muted'"
          aria-hidden="true"
        ></span>
        {{ status.text }}
      </span>
      <NeonButton variant="primary" @click="openMonths()">{{ card.action }}</NeonButton>
    </div>
  </header>

  <NeonEmptyState v-if="needsAccount" role="status">
    Crea una cuenta de efectivo, inversión o pasivo en Configuración para ver tu patrimonio.
  </NeonEmptyState>

  <template v-else>
    <NeonWealthBalanceBar
      :totals="totals"
      class="motion-safe:animate-rise motion-safe:[animation-delay:70ms]"
    />

    <div
      class="grid min-w-0 items-stretch gap-5 @min-[1100px]:grid-cols-[minmax(0,1.7fr)_minmax(300px,1fr)]"
    >
      <NeonWealthEvolution
        v-model:range="range"
        :points="chart"
        :year="year"
        :currency="currency"
        class="motion-safe:animate-rise motion-safe:[animation-delay:140ms]"
      />

      <NeonWealthMix
        :segments="mix.segments"
        :label="mix.label"
        layout="list"
        class="motion-safe:animate-rise motion-safe:[animation-delay:140ms]"
      />
    </div>

    <NeonWealthHoldings
      :groups="groups"
      class="motion-safe:animate-rise motion-safe:[animation-delay:210ms]"
      @open="toggleAccount"
    />
  </template>

  <NeonWealthAccountPopover
    v-model:open="detailOpen"
    :view="view"
    :target="shownAccount"
    :month="month"
  />
</template>

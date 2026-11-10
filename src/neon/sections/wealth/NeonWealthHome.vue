<script setup lang="ts">
import NeonButton from '../../ui/NeonButton.vue'
import NeonEmptyState from '../../ui/NeonEmptyState.vue'
import NeonWealthAccountDetail from './NeonWealthAccountDetail.vue'
import NeonWealthEquation from './NeonWealthEquation.vue'
import NeonWealthEvolution from './NeonWealthEvolution.vue'
import NeonWealthHoldings from './NeonWealthHoldings.vue'
import NeonWealthMix from './NeonWealthMix.vue'
import { useWealthCover } from './wealth-cover'

// The cover of the new Patrimonio: the balance equation of the month, the
// invitation to close it, how the net worth went this year, where the assets
// are and what you have, group by group. A row opens that account's detail.
const {
  year,
  month,
  view,
  monthLower,
  needsAccount,
  totals,
  status,
  card,
  chart,
  mix,
  groups,
  date,
  period,
  chartKind,
  openMonths,
  shownAccount,
  detailOpen,
  showAccount,
} = useWealthCover()
</script>

<template>
  <header class="flex flex-wrap items-end justify-between gap-x-6 gap-y-3">
    <div class="grid min-w-0 gap-1">
      <p class="text-muted text-label tracking-label font-extrabold uppercase">
        Balance patrimonial · {{ monthLower }} {{ year }}
      </p>
      <h1
        id="wealth-title"
        tabindex="-1"
        class="font-display motion-safe:animate-rise text-[clamp(30px,3.2cqi,44px)] leading-[1.1] font-bold tracking-[-0.03em] outline-none"
      >
        Patrimonio
      </h1>
    </div>
    <p class="text-soft max-w-[46ch] text-[16px]">Lo que tienes, dónde está y cómo ha ido.</p>
  </header>

  <NeonEmptyState v-if="needsAccount" role="status">
    Crea una cuenta de efectivo, inversión o pasivo en Configuración para ver tu patrimonio.
  </NeonEmptyState>

  <template v-else>
    <NeonWealthEquation
      :totals="totals"
      :status="status"
      class="motion-safe:animate-rise motion-safe:[animation-delay:70ms]"
    />

    <section
      aria-label="Cierre del mes"
      class="bg-panel border-line rounded-card motion-safe:animate-rise flex flex-wrap items-center gap-x-5 gap-y-3 border px-6 py-[22px] motion-safe:[animation-delay:140ms]"
    >
      <div class="grid min-w-0 flex-[1_1_260px] gap-0.5">
        <span class="text-[18px] font-extrabold">{{ card.title }}</span>
        <span class="text-muted text-note">{{ card.note }}</span>
      </div>
      <NeonButton variant="primary" @click="openMonths()">{{ card.action }}</NeonButton>
    </section>

    <NeonWealthEvolution
      v-model:period="period"
      v-model:kind="chartKind"
      :chart="chart"
      class="motion-safe:animate-rise motion-safe:[animation-delay:210ms]"
    />

    <NeonWealthMix
      :segments="mix.segments"
      :note="mix.note"
      :label="mix.label"
      class="motion-safe:animate-rise motion-safe:[animation-delay:210ms]"
    />

    <NeonWealthHoldings :groups="groups" :date="date" @open="showAccount" />
  </template>

  <NeonWealthAccountDetail
    v-model:open="detailOpen"
    :view="view"
    :target="shownAccount"
    :month="month"
  />
</template>

<script setup lang="ts">
import { storeToRefs } from 'pinia'
import { shallowRef, watch } from 'vue'

import { useAccountRequirement } from '../../composables/useAccountRequirement'
import { useEntrySheet } from '../../composables/useEntrySheet'
import { useMediaQuery } from '../../composables/useMediaQuery'
import { FRAME_QUERY } from '../ui/sheet-drag'
import DashboardCategoriesCard from './DashboardCategoriesCard.vue'
import DashboardGoalsCard from './DashboardGoalsCard.vue'
import DashboardInvestmentsCard from './DashboardInvestmentsCard.vue'
import DashboardMobile from './DashboardMobile.vue'
import DashboardMonthCard from './DashboardMonthCard.vue'
import DashboardPendingCard from './DashboardPendingCard.vue'
import DashboardRecentCard from './DashboardRecentCard.vue'
import DashboardWealthCard from './DashboardWealthCard.vue'
import { useNeonDashboardStore } from './store'

// Home of the new design (DESIGN.md, «Inicio en escritorio»): the header with
// search and «Apuntar», then a two-column grid. The month goes on top, «Te
// quedan» on the left and «Por confirmar» in the aside, both in view without
// scrolling; below, net worth with investments, and the latest movements with
// spending by category and goals. Below the container's two-column width the
// blocks stack in that same order.
//
// The mobile frame gets its own composition (DashboardMobile) from the same
// view model: there «Apuntar» is the FAB, search and «Por confirmar» live in
// the top bar, so the home is laid out around them. Which one shows follows
// the frame's own media query, not the container: it is the frame that moves
// those controls.
defineProps<{ isActive?: boolean }>()

const store = useNeonDashboardStore()
const { viewModel, range, recentFilter } = storeToRefs(store)
const { needsAccount } = useAccountRequirement()
const { openEntrySheet } = useEntrySheet()
const query = shallowRef('')
const desktopFrame = useMediaQuery(FRAME_QUERY)
// The mobile home has no type chips: its list always shows every type.
watch(
  desktopFrame,
  (desktop) => {
    if (!desktop) recentFilter.value = 'all'
  },
  { immediate: true },
)

function search(): void {
  if (query.value.trim()) store.searchMovements(query.value)
}
</script>

<template>
  <section
    id="dashboard"
    class="@container grid min-w-0 content-start gap-5"
    aria-labelledby="dashboard-title"
    data-neon-section
  >
    <DashboardMobile v-if="!desktopFrame" :view-model="viewModel" @navigate="store.navigate" />
    <header v-else class="flex flex-wrap items-end justify-between gap-x-6 gap-y-3">
      <div class="flex flex-col gap-1">
        <p class="text-muted text-label tracking-label font-extrabold uppercase">
          {{ viewModel.date }}
        </p>
        <h1
          id="dashboard-title"
          class="font-display text-h1 text-text motion-safe:animate-rise font-bold"
        >
          {{ viewModel.title }}
        </h1>
        <p class="text-soft text-lede mbs-1">{{ viewModel.lede }}</p>
      </div>
      <div class="flex flex-wrap items-center gap-2.5">
        <form role="search" class="contents" @submit.prevent="search">
          <label
            class="border-ctrl-line text-muted rounded-pill focus-within:outline-accent flex min-h-11.5 w-65 items-center gap-2.5 border px-4.5 focus-within:outline-2 focus-within:outline-offset-2"
          >
            <svg
              class="size-4.5 shrink-0"
              viewBox="0 0 24 24"
              fill="none"
              stroke="currentColor"
              stroke-width="2"
              stroke-linecap="round"
              aria-hidden="true"
            >
              <path d="M11 18a7 7 0 1 0 0-14 7 7 0 0 0 0 14zM20 20l-4-4" />
            </svg>
            <span class="sr-only">Buscar movimientos</span>
            <input
              v-model="query"
              type="search"
              enterkeyhint="search"
              placeholder="Busca un movimiento…"
              class="text-text placeholder:text-muted min-w-0 flex-1 bg-transparent text-base font-bold outline-none"
            />
          </label>
        </form>
        <button
          type="button"
          class="bg-accent text-on-accent font-display outline-text rounded-pill inline-flex min-h-11 items-center gap-2 ps-4.5 pe-5.5 text-sm font-bold focus-visible:outline-2 focus-visible:outline-offset-2 disabled:opacity-50 motion-safe:transition-transform motion-safe:enabled:active:scale-[0.96]"
          :disabled="needsAccount"
          data-dashboard-apuntar
          @click="openEntrySheet"
        >
          <svg
            class="size-4"
            viewBox="0 0 24 24"
            fill="none"
            stroke="currentColor"
            stroke-width="2"
            stroke-linecap="round"
            aria-hidden="true"
          >
            <path d="M12 5v14M5 12h14" />
          </svg>
          Apuntar
        </button>
      </div>
    </header>

    <div
      v-if="desktopFrame"
      class="grid grid-cols-1 items-start gap-5 @4xl:grid-cols-[minmax(0,1.5fr)_minmax(380px,1fr)] @4xl:[grid-template-areas:'mes_pend'_'neto_inv'_'mov_cat'_'mov_obj']"
    >
      <DashboardMonthCard
        :month="viewModel.month"
        class="motion-safe:animate-rise motion-safe:[animation-delay:70ms] @4xl:[grid-area:mes]"
      />
      <DashboardPendingCard
        :pending="viewModel.pending"
        class="motion-safe:animate-rise self-stretch motion-safe:[animation-delay:140ms] @4xl:[grid-area:pend]"
        @confirm-all="store.confirmAllPending"
        @navigate="store.navigate"
      />
      <DashboardWealthCard
        v-model:range="range"
        :wealth="viewModel.wealth"
        class="motion-safe:animate-rise self-stretch motion-safe:[animation-delay:140ms] @4xl:[grid-area:neto]"
        @navigate="store.navigate"
      />
      <DashboardInvestmentsCard
        :investments="viewModel.investments"
        class="motion-safe:animate-rise self-stretch motion-safe:[animation-delay:210ms] @4xl:[grid-area:inv]"
        @navigate="store.navigate"
      />
      <DashboardRecentCard
        v-model:filter="recentFilter"
        :recent="viewModel.recent"
        class="motion-safe:animate-rise motion-safe:[animation-delay:280ms] @4xl:[grid-area:mov]"
        @navigate="store.navigate"
      />
      <DashboardCategoriesCard
        :categories="viewModel.categories"
        class="motion-safe:animate-rise motion-safe:[animation-delay:350ms] @4xl:[grid-area:cat]"
        @navigate="store.navigate"
      />
      <DashboardGoalsCard
        :goals="viewModel.goals"
        class="motion-safe:animate-rise motion-safe:[animation-delay:420ms] @4xl:[grid-area:obj]"
        @navigate="store.navigate"
      />
    </div>
  </section>
</template>

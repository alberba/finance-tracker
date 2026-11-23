<script setup lang="ts">
import { storeToRefs } from 'pinia'
import { computed, nextTick, onBeforeUnmount, shallowRef, useTemplateRef } from 'vue'

import { useAccountRequirement } from '../../composables/useAccountRequirement'
import { useEntrySheet } from '../../composables/useEntrySheet'
import { useMediaQuery } from '../../composables/useMediaQuery'
import NeonEmptyState from '../ui/NeonEmptyState.vue'
import { FRAME_QUERY } from '../ui/sheet-drag'
import DashboardCategoriesCard from './DashboardCategoriesCard.vue'
import DashboardGoalsCard from './DashboardGoalsCard.vue'
import DashboardInvestmentsCard from './DashboardInvestmentsCard.vue'
import DashboardMobile from './DashboardMobile.vue'
import DashboardMonthCard from './DashboardMonthCard.vue'
import DashboardPendingCard from './DashboardPendingCard.vue'
import DashboardRangePicker from './DashboardRangePicker.vue'
import DashboardRecentCard from './DashboardRecentCard.vue'
import DashboardWealthCard from './DashboardWealthCard.vue'
import DashboardCatalog from './layout/DashboardCatalog.vue'
import DashboardGrid from './layout/DashboardGrid.vue'
import { readingOrder } from './layout/engine'
import { useDashboardLayoutStore } from './layout/store'
import { useLayoutGestures } from './layout/use-layout-gestures'
import { WIDGETS, type WidgetId } from './layout/widgets'
import { useNeonDashboardStore } from './store'

// Home of the new design (DESIGN.md, «Inicio en escritorio»): the header with
// search and «Apuntar», then the widgets on a grid of six columns of square
// cells, as many rows as they need. Where each one sits and how big it is
// comes from the layout in the store (by default: net worth with «Te quedan»;
// movements with investments; and «Por confirmar», spending by category and
// goals). Below the container's 56rem the cells go away and the widgets stack
// in the order the layout reads, row by row.
//
// The mobile frame gets its own composition (DashboardMobile) from the same
// view model: there «Apuntar» is the FAB, search and «Por confirmar» live in
// the top bar, so the home is laid out around them. Which one shows follows
// the frame's own media query, not the container: it is the frame that moves
// those controls.
defineProps<{ isActive?: boolean }>()

const store = useNeonDashboardStore()
const { viewModel, range } = storeToRefs(store)
const { needsAccount } = useAccountRequirement()
const { openEntrySheet } = useEntrySheet()
const query = shallowRef('')
const desktopFrame = useMediaQuery(FRAME_QUERY)

const layoutStore = useDashboardLayoutStore()
const grid = useTemplateRef<InstanceType<typeof DashboardGrid>>('grid')
const gestures = useLayoutGestures(() => grid.value?.element ?? null)
const editToggle = useTemplateRef<HTMLButtonElement>('editToggle')

// The DOM order is the order the widgets stack in: the reading order of what is
// kept. A gesture's preview only moves widgets on the grid, never in the DOM,
// so the one being dragged keeps its focus.
const shown = computed(() => {
  const order = readingOrder(layoutStore.layout.items).map((item) => item.id)
  const rank = (id: WidgetId) => (order.includes(id) ? order.indexOf(id) : order.length)
  return [...layoutStore.items].sort((a, b) => rank(a.id) - rank(b.id))
})

const confirmingReset = shallowRef(false)

function toggleEditing(): void {
  confirmingReset.value = false
  layoutStore.setEditing(!layoutStore.editing)
}

async function removeWidget(id: WidgetId): Promise<void> {
  layoutStore.remove(id)
  await nextTick()
  // Its entry is in the catalog now: the focus follows it there, not to the page.
  const entry = document.querySelector<HTMLElement>(`[data-catalog-add="${id}"]`)
  ;(entry ?? editToggle.value)?.focus()
}

async function addWidget(id: WidgetId): Promise<void> {
  layoutStore.add(id)
  await nextTick()
  document.querySelector<HTMLElement>(`[data-widget-edit="${id}"]`)?.focus()
}

function resetLayout(): void {
  layoutStore.reset()
  confirmingReset.value = false
}

onBeforeUnmount(() => layoutStore.setEditing(false))

const BAR_BUTTON =
  'border-ctrl-line text-text outline-accent rounded-pill min-h-10 cursor-pointer border px-4 text-sm font-extrabold focus-visible:outline-2 focus-visible:outline-offset-2 disabled:cursor-default disabled:opacity-50 pointer-coarse:min-h-11 motion-safe:transition-transform motion-safe:duration-160 motion-safe:enabled:active:scale-[0.96]'

function search(): void {
  if (query.value.trim()) store.searchMovements(query.value)
}
</script>

<template>
  <section
    id="dashboard"
    class="@container grid min-w-0 content-start gap-5 tabular-nums"
    aria-labelledby="dashboard-title"
    data-neon-section
  >
    <DashboardMobile v-if="!desktopFrame" :view-model="viewModel" @navigate="store.navigate" />
    <header v-else class="flex flex-wrap items-center justify-between gap-x-6 gap-y-3">
      <div class="flex flex-col gap-1">
        <div class="flex items-center gap-3">
          <h1
            id="dashboard-title"
            class="text-text motion-safe:animate-rise font-sans text-[26px] leading-[1.15] font-extrabold tracking-tight text-balance"
          >
            Dashboard
          </h1>
          <DashboardRangePicker
            v-model="range"
            :label="viewModel.rangeLabel"
            :options="viewModel.rangeOptions"
            :months="viewModel.rangeMonths"
          />
          <button
            ref="editToggle"
            type="button"
            class="text-muted hover:text-text outline-accent border-ctrl-line hidden size-11 shrink-0 cursor-pointer place-items-center rounded-full border focus-visible:outline-2 focus-visible:outline-offset-2 motion-safe:transition-[transform,background-color,color] motion-safe:duration-160 motion-safe:active:scale-[0.94] @4xl:grid"
            :class="layoutStore.editing && 'bg-sel-bg! text-sel-text! border-transparent'"
            :aria-pressed="layoutStore.editing"
            :aria-label="
              layoutStore.editing ? 'Terminar de editar el inicio' : 'Editar distribución'
            "
            data-dashboard-edit-toggle
            @click="toggleEditing"
          >
            <svg
              class="size-5"
              viewBox="0 0 24 24"
              fill="none"
              stroke="currentColor"
              stroke-width="2"
              stroke-linecap="round"
              stroke-linejoin="round"
              aria-hidden="true"
            >
              <path v-if="layoutStore.editing" d="M5 12.5 10 17.5 19 7.5" />
              <path v-else d="M4 20h4L19 9a2.8 2.8 0 0 0-4-4L4 16v4zM13.5 6.5l4 4" />
            </svg>
          </button>
        </div>
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
      v-if="desktopFrame && layoutStore.editing"
      class="bg-panel2 border-line rounded-card hidden flex-wrap items-center justify-between gap-x-6 gap-y-2 border px-5 py-3 @4xl:flex"
      role="region"
      aria-label="Edición del inicio"
      data-dashboard-edit-bar
    >
      <p class="text-soft text-note text-pretty">
        Arrastra un widget para moverlo y tira de su esquina para cambiar el tamaño.
      </p>
      <div class="flex flex-wrap items-center gap-2">
        <button
          v-if="!layoutStore.catalogOpen"
          type="button"
          :class="BAR_BUTTON"
          @click="layoutStore.catalogOpen = true"
        >
          Widgets
        </button>
        <template v-if="confirmingReset">
          <span class="text-muted text-note">¿Volver a la distribución por defecto?</span>
          <button type="button" :class="[BAR_BUTTON, 'text-loss']" @click="resetLayout">
            Restablecer
          </button>
          <button type="button" :class="BAR_BUTTON" @click="confirmingReset = false">
            Cancelar
          </button>
        </template>
        <button
          v-else
          type="button"
          :class="BAR_BUTTON"
          :disabled="layoutStore.isDefault"
          @click="confirmingReset = true"
        >
          Restablecer
        </button>
      </div>
    </div>

    <DashboardGrid
      v-if="desktopFrame && shown.length"
      ref="grid"
      :items="shown"
      :editing="layoutStore.editing"
      :active-id="layoutStore.activeId"
      @move-start="gestures.beginMove"
      @resize-start="gestures.beginResize"
      @widget-key="gestures.onWidgetKey"
      @remove="removeWidget"
      @chart="layoutStore.setChart"
    >
      <template #widget="{ item }">
        <DashboardWealthCard
          v-if="item.id === 'wealth'"
          :wealth="viewModel.wealth"
          :chart-side="item.chart"
          class="h-full"
        />
        <DashboardMonthCard
          v-else-if="item.id === 'month'"
          :month="viewModel.month"
          :pending-count="viewModel.pending.count"
          class="h-full"
        />
        <DashboardRecentCard
          v-else-if="item.id === 'recent'"
          :recent="viewModel.recent"
          class="h-full"
          @navigate="store.navigate"
        />
        <DashboardInvestmentsCard
          v-else-if="item.id === 'investments'"
          :investments="viewModel.investments"
          :chart-side="item.chart"
          class="h-full"
        />
        <DashboardPendingCard
          v-else-if="item.id === 'pending'"
          :pending="viewModel.pending"
          class="h-full"
          @confirm-all="store.confirmAllPending"
          @navigate="store.navigate"
        />
        <DashboardCategoriesCard
          v-else-if="item.id === 'categories'"
          :categories="viewModel.categories"
          class="h-full"
          @navigate="store.navigate"
        />
        <DashboardGoalsCard
          v-else-if="item.id === 'goals'"
          :goals="viewModel.goals"
          class="h-full"
          @navigate="store.navigate"
        />
      </template>
    </DashboardGrid>
    <NeonEmptyState v-else-if="desktopFrame" data-dashboard-empty>
      {{
        layoutStore.editing
          ? 'No hay widgets en el inicio. Añade alguno desde el panel de widgets.'
          : 'No hay widgets en el inicio.'
      }}
      <template v-if="!layoutStore.editing" #action>
        <button
          type="button"
          class="text-text outline-accent rounded-pill -ms-4 min-h-11 cursor-pointer px-4 text-sm font-extrabold underline underline-offset-4 focus-visible:outline-2"
          @click="toggleEditing"
        >
          Editar distribución
        </button>
      </template>
    </NeonEmptyState>

    <template v-if="desktopFrame && layoutStore.editing">
      <DashboardCatalog
        v-if="layoutStore.catalogOpen"
        :absent="layoutStore.absent"
        @add="addWidget"
        @drag-start="gestures.beginInsert"
        @close="layoutStore.catalogOpen = false"
      />
      <div
        v-if="layoutStore.ghost"
        class="bg-panel2 text-text border-accent rounded-pill shadow-float pointer-events-none fixed z-50 -translate-x-1/2 -translate-y-1/2 border px-4 py-2 text-sm font-extrabold"
        :style="{ left: `${layoutStore.ghost.x}px`, top: `${layoutStore.ghost.y}px` }"
        aria-hidden="true"
      >
        {{ WIDGETS[layoutStore.ghost.id].title }}
      </div>
    </template>
    <p class="sr-only" aria-live="polite">{{ layoutStore.announcement }}</p>
  </section>
</template>

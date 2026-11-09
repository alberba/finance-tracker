<script setup lang="ts">
import { computed, onMounted, shallowRef } from 'vue'

import { useEntrySheet } from '../../composables/useEntrySheet'
import { useWindowScroll } from '../../composables/useWindowScroll'
import { splitDecimals } from '../../lib/format'
import { getPathFromSection } from '../../scripts/app/dashboard-section-routing'
import type { SectionId } from '../../scripts/types'
import { usePendingSheet } from '../layout/pending-sheet'
import { categoryIcon } from '../ui/category-icons'
import NeonCategoryIcon from '../ui/NeonCategoryIcon.vue'
import NeonCard from '../ui/NeonCard.vue'
import NeonEmptyState from '../ui/NeonEmptyState.vue'
import NeonFigure from '../ui/NeonFigure.vue'
import NeonProgressBar from '../ui/NeonProgressBar.vue'
import { useQuotesNote } from './quotes-note'
import type { NeonDashboardViewModel } from './view-model'

// Home of the new design in the mobile frame (canvas «D · Propuesta final…
// · móvil»): one column with the same data as the desktop home. On top the
// month's figure, with what came in and what waits for a yes (which opens the
// «Por confirmar» sheet of the top bar); then the month's flows and spending
// pace, the latest movements, spending by category, net worth with
// investments, and goals. «Apuntar» is the frame's FAB and search sits in the
// top bar. Past 120px of scroll the figure goes up into the top bar.
const props = defineProps<{ viewModel: NeonDashboardViewModel }>()
const emit = defineEmits<{ navigate: [section: SectionId] }>()

const { openEntrySheet } = useEntrySheet()
const { openPendingSheet } = usePendingSheet()
const quotes = useQuotesNote()

const month = computed(() => props.viewModel.month)
const left = computed(() => splitDecimals(month.value.left.text))
// A long figure steps down so it stays on one line (DESIGN.md, 52px on mobile).
const heroSize = computed(() => {
  const length = left.value.whole.length
  return length > 7 ? 'text-[42px]' : length > 5 ? 'text-[48px]' : 'text-[52px]'
})

/** Scroll (px) past which the figure moves into the top bar (DESIGN.md, «Barra superior móvil»). */
const BAR_FIGURE_FROM = 120
const scrollY = useWindowScroll()
const scrolled = computed(() => scrollY.value > BAR_FIGURE_FROM)
// The top bar is static markup of the frame, already there when this mounts.
const barSlot = shallowRef<HTMLElement | null>(null)
onMounted(() => {
  barSlot.value = document.querySelector<HTMLElement>('[data-bar-figure-slot]')
})

/** A real link, so it opens in a new tab; a plain click moves inside the app. */
function follow(event: MouseEvent, section: SectionId): void {
  if (event.metaKey || event.ctrlKey || event.shiftKey || event.button !== 0) return
  event.preventDefault()
  emit('navigate', section)
}

const TONE_TEXT = { gain: 'text-gain', loss: 'text-loss', neutral: 'text-text' } as const
const FLOW_TEXT = { income: 'text-gain', expense: 'text-text', investment: 'text-text' } as const
const AMOUNT_TEXT = {
  expense: 'text-text',
  income: 'text-gain',
  investment: 'text-text',
  saving: 'text-soft',
} as const
const ROW = 'border-line flex min-h-16 items-center gap-3 border-t px-1 py-2.5'
</script>

<template>
  <div class="grid min-w-0 gap-3">
    <section
      class="motion-safe:animate-rise flex flex-col gap-0.5 px-2 pbs-1"
      aria-labelledby="dashboard-title"
    >
      <h1
        id="dashboard-title"
        class="text-soft font-sans text-[15px] leading-[1.35] font-bold tracking-normal"
      >
        {{ month.leftLabel }} en {{ month.name.toLowerCase() }}
      </h1>
      <p
        class="font-display mbs-0.5 leading-[1.05] font-bold tracking-[-0.045em] whitespace-nowrap tabular-nums"
        :class="[heroSize, TONE_TEXT[month.left.tone]]"
        data-dashboard-left
      >
        {{ left.whole
        }}<span v-if="left.rest" class="text-muted text-[0.4em] tracking-[-0.02em]">{{
          left.rest
        }}</span>
      </p>
      <p class="text-soft flex min-h-11 flex-wrap items-center gap-x-3 text-[15px]">
        <span>
          de los
          <span class="font-display text-text font-semibold tabular-nums">{{ month.income }}</span>
          que han entrado
        </span>
        <button
          v-if="viewModel.pending.count"
          type="button"
          class="text-text outline-accent rounded-pill min-h-11 font-extrabold underline underline-offset-4 focus-visible:outline-2 focus-visible:outline-offset-2 motion-safe:transition-transform motion-safe:duration-160 motion-safe:ease-out motion-safe:active:scale-[0.97]"
          aria-haspopup="dialog"
          @click="openPendingSheet"
        >
          {{ month.pendingNote }}
        </button>
      </p>
    </section>

    <Teleport v-if="barSlot" :to="barSlot">
      <p
        class="flex items-baseline gap-2 whitespace-nowrap data-[bar-figure=hidden]:translate-y-1.5 data-[bar-figure=hidden]:opacity-0 motion-safe:transition-[opacity,translate] motion-safe:duration-200 motion-safe:ease-out"
        :data-bar-figure="scrolled ? 'shown' : 'hidden'"
        aria-hidden="true"
      >
        <span class="text-soft text-sm font-bold">{{ month.leftLabel }}</span>
        <span
          class="font-display text-lg font-semibold tracking-[-0.02em] tabular-nums"
          :class="TONE_TEXT[month.left.tone]"
        >
          {{ month.left.text }}
        </span>
      </p>
    </Teleport>

    <section
      class="motion-safe:animate-rise motion-safe:[animation-delay:50ms]"
      aria-labelledby="dashboard-flows-title"
    >
      <h2 id="dashboard-flows-title" class="sr-only">Entradas y salidas de {{ month.name }}</h2>
      <ul class="border-line mbs-1.5 grid grid-cols-3 border-y">
        <li
          v-for="(row, index) in month.rows"
          :key="row.kind"
          :class="index > 0 && 'shadow-[inset_1px_0_0_var(--color-line)]'"
        >
          <a
            :href="getPathFromSection('transactions')"
            class="text-text outline-accent flex min-h-16 min-w-0 flex-col justify-center gap-0.5 py-2.5 ps-3.5 pe-1.5 focus-visible:outline-2 focus-visible:-outline-offset-2 motion-safe:transition-transform motion-safe:duration-160 motion-safe:ease-out motion-safe:active:scale-[0.97]"
            @click="follow($event, 'transactions')"
          >
            <span class="text-muted text-meta">{{ row.label }}</span>
            <span
              class="font-display truncate text-[15px] font-semibold tracking-[-0.02em] tabular-nums"
              :class="FLOW_TEXT[row.kind]"
            >
              {{ row.amount }}
            </span>
            <span class="sr-only">{{ row.history }}</span>
          </a>
        </li>
      </ul>
      <p v-if="month.pace" class="text-muted text-meta px-2 pbs-2" data-dashboard-pace>
        {{ month.pace.lead
        }}<b class="font-extrabold" :class="TONE_TEXT[month.pace.tone]">{{ month.pace.emphasis }}</b
        >{{ month.pace.tail }}
      </p>
    </section>

    <NeonCard
      title="Movimientos"
      title-id="dashboard-recent-title"
      :to="{ section: 'transactions', label: 'Ver todos', text: 'Ver todos' }"
      class="motion-safe:animate-rise motion-safe:[animation-delay:100ms]"
      data-dashboard-recent
      @navigate="emit('navigate', $event)"
    >
      <NeonEmptyState v-if="!viewModel.recent.items.length">
        {{ viewModel.recent.empty }}
        <template #action>
          <button
            type="button"
            class="text-text outline-accent rounded-pill -ms-4 min-h-11 px-4 text-sm font-extrabold underline underline-offset-4 focus-visible:outline-2"
            @click="openEntrySheet"
          >
            Apuntar uno
          </button>
        </template>
      </NeonEmptyState>
      <ul v-else aria-label="Movimientos recientes">
        <li v-for="item in viewModel.recent.items" :key="item.id" :class="ROW">
          <NeonCategoryIcon :path="categoryIcon(item.type, item.category)" />
          <span class="flex min-w-0 flex-1 flex-col">
            <span class="text-row truncate font-bold">{{ item.description }}</span>
            <span class="text-muted text-meta truncate">{{ item.category }} · {{ item.date }}</span>
          </span>
          <span
            class="font-display text-figure-row font-semibold whitespace-nowrap tabular-nums"
            :class="AMOUNT_TEXT[item.type]"
          >
            {{ item.amount }}
          </span>
        </li>
      </ul>
    </NeonCard>

    <NeonCard
      title="Gasto por categoría"
      title-id="dashboard-categories-title"
      :to="{ section: 'budget', label: 'Ir a Presupuesto', text: 'Presupuesto' }"
      class="motion-safe:animate-rise motion-safe:[animation-delay:150ms]"
      data-dashboard-categories
      @navigate="emit('navigate', $event)"
    >
      <NeonEmptyState v-if="!viewModel.categories.length">
        Aún no hay gastos ni límites este mes.
      </NeonEmptyState>
      <ul v-else class="flex flex-col gap-3.5 px-1">
        <li v-for="item in viewModel.categories" :key="item.category" class="flex flex-col gap-1.5">
          <div class="flex items-baseline justify-between gap-3">
            <span class="truncate text-[15px] font-bold">{{ item.category }}</span>
            <span class="text-muted text-meta whitespace-nowrap">
              <span
                class="font-display text-[15px] font-semibold tabular-nums"
                :class="item.over ? 'text-loss' : 'text-text'"
                >{{ item.spent }}</span
              >
              {{ item.limit ? `de ${item.limit}` : '· sin límite' }}
            </span>
          </div>
          <NeonProgressBar v-if="item.limit" :value="item.width" :over="item.over" />
        </li>
      </ul>
    </NeonCard>

    <NeonCard
      title="Patrimonio"
      title-id="dashboard-wealth-title"
      :to="{ section: 'wealth', label: 'Ver el detalle del patrimonio', text: 'Detalle' }"
      class="motion-safe:animate-rise motion-safe:[animation-delay:200ms]"
      data-dashboard-wealth
      @navigate="emit('navigate', $event)"
    >
      <div class="flex flex-col gap-1 px-1">
        <p class="flex flex-wrap items-baseline gap-x-3">
          <NeonFigure
            :value="viewModel.wealth.value"
            class="text-figure-lg text-text leading-[1.1] font-semibold"
          />
          <span
            v-if="viewModel.wealth.monthChange"
            class="text-delta font-extrabold"
            :class="TONE_TEXT[viewModel.wealth.monthChange.tone]"
          >
            {{ viewModel.wealth.monthChange.text }} este mes
          </span>
        </p>
        <p v-if="viewModel.wealth.yearChange" class="text-muted text-meta">
          <b class="font-extrabold" :class="TONE_TEXT[viewModel.wealth.yearChange.tone]">{{
            viewModel.wealth.yearChange.text
          }}</b>
          en lo que va de año
        </p>
      </div>
      <a
        :href="getPathFromSection('investment')"
        :class="ROW"
        class="text-text outline-accent text-start focus-visible:outline-2 focus-visible:-outline-offset-2"
        data-dashboard-investments
        @click="follow($event, 'investment')"
      >
        <NeonCategoryIcon path="M3 17l6-6 4 4 8-8M15 7h6v6" />
        <span class="flex min-w-0 flex-1 flex-col">
          <span class="text-row font-bold">Inversiones</span>
          <span class="text-muted text-meta truncate">
            <template v-if="viewModel.investments.empty">Aún no tienes inversiones</template>
            <template v-else>
              <b
                v-if="viewModel.investments.gain"
                class="font-extrabold"
                :class="TONE_TEXT[viewModel.investments.gain.tone]"
                >{{ viewModel.investments.gain.text }}</b
              >
              <template v-if="quotes">
                {{ viewModel.investments.gain ? '·' : '' }} {{ quotes.short }}
              </template>
            </template>
          </span>
        </span>
        <span class="font-display text-figure-row font-semibold whitespace-nowrap tabular-nums">
          {{ viewModel.investments.value }}
        </span>
      </a>
    </NeonCard>

    <NeonCard
      title="Objetivos"
      title-id="dashboard-goals-title"
      :to="{ section: 'goals', label: 'Ver el detalle de los objetivos', text: 'Detalle' }"
      class="motion-safe:animate-rise motion-safe:[animation-delay:250ms]"
      data-dashboard-goals
      @navigate="emit('navigate', $event)"
    >
      <NeonEmptyState v-if="!viewModel.goals.length">
        Aún no tienes objetivos definidos.
      </NeonEmptyState>
      <ul v-else class="flex flex-col gap-3.5 px-1 pbe-1">
        <li v-for="goal in viewModel.goals" :key="goal.key" class="flex flex-col gap-1.5">
          <div class="flex items-baseline justify-between gap-3">
            <span class="truncate text-[15px] font-bold">{{ goal.name }}</span>
            <span class="font-display text-[15px] font-semibold tabular-nums">
              {{ goal.progress }}
            </span>
          </div>
          <NeonProgressBar :value="goal.width" />
          <span class="text-muted text-meta">{{ goal.detail }}</span>
        </li>
      </ul>
    </NeonCard>
  </div>
</template>

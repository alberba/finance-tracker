<script setup lang="ts">
import { computed, onMounted, ref, useTemplateRef, watch } from 'vue'

import { useAccountRequirement } from '../../../composables/useAccountRequirement'
import { useEntrySheet } from '../../../composables/useEntrySheet'
import { useMediaQuery } from '../../../composables/useMediaQuery'
import { formatWeekdayDate } from '../../../lib/format'
import type { TransactionsSubTab } from '../../../scripts/types'
import { todayISO } from '../../../scripts/utils'
import { useMovementsStore } from '../../../stores/movements'
import { useUiStore } from '../../../stores/ui'
import NeonBarTitle from '../../ui/NeonBarTitle.vue'
import NeonButton from '../../ui/NeonButton.vue'
import NeonEmptyState from '../../ui/NeonEmptyState.vue'
import { FRAME_QUERY } from '../../ui/sheet-drag'
import NeonRegistry from './NeonRegistry.vue'
import NeonSubscriptions from './NeonSubscriptions.vue'

// Movimientos (artboard «Movimientos · 2560 px», #431): the
// date label, the title and its lede with the primary action, the two tabs
// (Registro and Suscripciones) and each tab's content. A new movement opens
// the shared entry sheet; a new subscription, the subscriptions panel.
//
// On the mobile frame the content is one column (container queries do that).
// The title goes up to the top bar (the page keeps its heading for screen
// readers), without the date and the lede, and the tabs split the width in
// halves. The frame's FAB opens «Apuntar» and the subscription action lives in
// its own panel, so showing it does not move the tabs.
withDefaults(defineProps<{ isActive?: boolean }>(), { isActive: false })

const movementsStore = useMovementsStore()
const uiStore = useUiStore()
const ui = uiStore.ui
const { needsAccount } = useAccountRequirement()
const { openEntrySheet } = useEntrySheet()
const desktopFrame = useMediaQuery(FRAME_QUERY)
const motionAllowed = useMediaQuery('(prefers-reduced-motion: no-preference)')
const subscriptions = useTemplateRef<InstanceType<typeof NeonSubscriptions>>('subscriptions')
const tabList = useTemplateRef<HTMLDivElement>('tabList')
const hasSwitchedTab = ref(false)

onMounted(() => {
  if (ui.txTab === 'subscriptions') {
    tabList.value?.querySelector<HTMLButtonElement>('[aria-selected="true"]')?.focus()
  }
})

watch(
  () => ui.txTab,
  () => {
    hasSwitchedTab.value = true
  },
)

const dateLabel = formatWeekdayDate(todayISO())
const tabs = computed(() => [
  { id: 'registry' as const, label: 'Registro', count: movementsStore.yearCount },
  {
    id: 'subscriptions' as const,
    label: 'Suscripciones',
    count: movementsStore.subscriptions.length,
  },
])

function pickTab(id: TransactionsSubTab): void {
  ui.txTab = id
}

function onTabKey(event: KeyboardEvent): void {
  if (event.key !== 'ArrowLeft' && event.key !== 'ArrowRight') return
  const next: TransactionsSubTab = ui.txTab === 'registry' ? 'subscriptions' : 'registry'
  pickTab(next)
  void Promise.resolve().then(() =>
    document.getElementById(`transactions-tab-${next}-button`)?.focus({ preventScroll: true }),
  )
}

function createNew(event: MouseEvent): void {
  if (needsAccount.value) return
  if (ui.txTab === 'subscriptions') subscriptions.value?.openNew()
  else openEntrySheet(event)
}

// «Apuntar un movimiento» from the setup guide lands here with the sheet open.
watch(
  () => uiStore.setupAction,
  (action) => {
    if (action !== 'movement' || needsAccount.value) return
    uiStore.setupAction = null
    openEntrySheet()
  },
  { immediate: true },
)
</script>

<template>
  <section
    v-show="isActive"
    id="transactions"
    class="@container grid min-w-0 content-start gap-6"
    aria-labelledby="transactions-title"
  >
    <NeonBarTitle v-if="isActive && !desktopFrame" title="Movimientos" />
    <header
      class="motion-safe:animate-rise flex flex-wrap items-end justify-between gap-x-6 gap-y-4"
      :class="!desktopFrame && 'sr-only'"
    >
      <div class="grid min-w-0 gap-1.5">
        <p class="text-muted text-label tracking-label font-extrabold uppercase">{{ dateLabel }}</p>
        <h1 id="transactions-title" class="font-display text-h1 font-bold">Movimientos</h1>
        <p class="text-soft text-[15px] @min-[560px]:text-[16px]">
          Lo que entra, lo que sale y lo que inviertes, mes a mes.
        </p>
      </div>
      <NeonButton v-if="desktopFrame" variant="primary" :disabled="needsAccount" @click="createNew">
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
        {{ ui.txTab === 'subscriptions' ? 'Nueva suscripción' : 'Nuevo movimiento' }}
      </NeonButton>
    </header>

    <NeonEmptyState
      v-if="needsAccount"
      class="motion-safe:animate-rise motion-safe:[animation-delay:var(--stagger)]"
      role="status"
    >
      Crea una cuenta en Configuración para registrar movimientos y suscripciones.
    </NeonEmptyState>

    <div
      ref="tabList"
      role="tablist"
      aria-label="Subsecciones de movimientos"
      class="border-line motion-safe:animate-rise mbs-[clamp(0px,2.2cqi_-_20px,16px)] flex border-be motion-safe:[animation-delay:var(--stagger)]"
      :class="desktopFrame && 'gap-7'"
      @keydown="onTabKey"
    >
      <button
        v-for="tab in tabs"
        :id="`transactions-tab-${tab.id}-button`"
        :key="tab.id"
        type="button"
        role="tab"
        :aria-selected="ui.txTab === tab.id"
        :aria-controls="`transactions-tab-${tab.id}`"
        :tabindex="ui.txTab === tab.id ? 0 : -1"
        class="outline-accent mbe-[-1px] inline-flex min-h-11 items-baseline gap-2 border-be-2 pbs-3 pbe-3.5 text-[16px] font-extrabold whitespace-nowrap focus-visible:outline-2 focus-visible:outline-offset-2 motion-safe:transition-[color,border-color] motion-safe:duration-160 motion-safe:ease-out"
        :class="[
          ui.txTab === tab.id
            ? 'border-text text-text'
            : 'text-muted pointer-fine:hover:text-soft border-transparent',
          !desktopFrame && 'flex-1 justify-center',
        ]"
        @click="pickTab(tab.id)"
      >
        {{ tab.label }}
        <span class="text-muted text-[13px] font-bold tabular-nums">{{ tab.count }}</span>
      </button>
    </div>

    <div
      class="motion-safe:animate-rise relative min-w-0 motion-safe:[animation-delay:calc(2*var(--stagger))]"
    >
      <Transition name="transactions-panel" :css="motionAllowed">
        <div
          v-show="ui.txTab === 'registry'"
          id="transactions-tab-registry"
          role="tabpanel"
          aria-labelledby="transactions-tab-registry-button"
          :inert="ui.txTab !== 'registry'"
        >
          <NeonRegistry
            :stagger-rows="!hasSwitchedTab"
            :bar-actions="isActive && ui.txTab === 'registry'"
          />
        </div>
      </Transition>
      <Transition name="transactions-panel" :css="motionAllowed">
        <div
          v-show="ui.txTab === 'subscriptions'"
          id="transactions-tab-subscriptions"
          role="tabpanel"
          aria-labelledby="transactions-tab-subscriptions-button"
          :inert="ui.txTab !== 'subscriptions'"
          class="min-h-(--ui-dvh)"
        >
          <NeonButton
            v-if="!desktopFrame"
            variant="primary"
            class="mbe-4"
            :disabled="needsAccount"
            @click="createNew"
          >
            Nueva suscripción
          </NeonButton>
          <NeonSubscriptions ref="subscriptions" />
        </div>
      </Transition>
    </div>
  </section>
</template>

<style scoped>
@media (prefers-reduced-motion: no-preference) {
  .transactions-panel-enter-active {
    transition: opacity 240ms var(--ease-out);
  }

  .transactions-panel-leave-active {
    position: absolute;
    inset-block-start: 0;
    inset-inline: 0;
    pointer-events: none;
    transition: opacity 150ms var(--ease-out);
  }

  .transactions-panel-enter-from,
  .transactions-panel-leave-to {
    opacity: 0;
  }
}
</style>

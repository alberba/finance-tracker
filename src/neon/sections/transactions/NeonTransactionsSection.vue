<script setup lang="ts">
import { computed, useTemplateRef, watch } from 'vue'

import { useAccountRequirement } from '../../../composables/useAccountRequirement'
import { useEntrySheet } from '../../../composables/useEntrySheet'
import { useMediaQuery } from '../../../composables/useMediaQuery'
import { formatWeekdayDate } from '../../../lib/format'
import type { TransactionsSubTab } from '../../../scripts/types'
import { todayISO } from '../../../scripts/utils'
import { useMovementsStore } from '../../../stores/movements'
import { useUiStore } from '../../../stores/ui'
import NeonButton from '../../ui/NeonButton.vue'
import NeonEmptyState from '../../ui/NeonEmptyState.vue'
import { FRAME_QUERY } from '../../ui/sheet-drag'
import NeonRegistry from './NeonRegistry.vue'
import NeonSubscriptions from './NeonSubscriptions.vue'

// Movimientos in the new design (artboard «Movimientos · 2560 px», #431): the
// date label, the title and its lede with the primary action, the two tabs
// (Registro and Suscripciones) and each tab's content. A new movement opens
// the shared entry sheet; a new subscription, the subscriptions panel.
//
// On the mobile frame (#432) the content is one column (container queries do
// that) and «Apuntar» is the frame's FAB, so the header only keeps its button
// on Suscripciones, where the FAB does not reach.
withDefaults(defineProps<{ isActive?: boolean }>(), { isActive: false })

const movementsStore = useMovementsStore()
const uiStore = useUiStore()
const ui = uiStore.ui
const { needsAccount } = useAccountRequirement()
const { openEntrySheet } = useEntrySheet()
const desktopFrame = useMediaQuery(FRAME_QUERY)
const showCreate = computed(() => desktopFrame.value || ui.txTab === 'subscriptions')
const subscriptions = useTemplateRef<InstanceType<typeof NeonSubscriptions>>('subscriptions')

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
    document.getElementById(`transactions-tab-${next}-button`)?.focus(),
  )
}

function createNew(): void {
  if (needsAccount.value) return
  if (ui.txTab === 'subscriptions') subscriptions.value?.openNew()
  else openEntrySheet()
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
    class="@container grid min-w-0 content-start gap-5"
    aria-labelledby="transactions-title"
  >
    <header class="flex flex-wrap items-end justify-between gap-x-6 gap-y-4">
      <div class="grid min-w-0 gap-1.5">
        <p class="text-muted text-label tracking-label font-extrabold uppercase">{{ dateLabel }}</p>
        <h1
          id="transactions-title"
          class="font-display text-[clamp(30px,3.2cqi,44px)] leading-[1.1] font-bold tracking-[-0.03em]"
        >
          Movimientos
        </h1>
        <p class="text-soft text-[15px] @min-[560px]:text-[16px]">
          Lo que entra, lo que sale y lo que inviertes, mes a mes.
        </p>
      </div>
      <NeonButton v-if="showCreate" variant="primary" :disabled="needsAccount" @click="createNew">
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

    <NeonEmptyState v-if="needsAccount" role="status">
      Crea una cuenta en Configuración para registrar movimientos y suscripciones.
    </NeonEmptyState>

    <div class="flex justify-center @min-[560px]:justify-start">
      <div
        role="tablist"
        aria-label="Subsecciones de movimientos"
        class="bg-panel2 rounded-pill inline-flex max-w-full gap-[3px] p-[3px]"
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
          class="outline-accent rounded-pill inline-flex min-h-[38px] items-center gap-2 px-4 text-[14px] font-extrabold whitespace-nowrap focus-visible:outline-2 focus-visible:-outline-offset-2 pointer-coarse:min-h-11"
          :class="ui.txTab === tab.id ? 'bg-sel-bg text-sel-text' : 'text-soft'"
          @click="pickTab(tab.id)"
        >
          {{ tab.label }}
          <span
            class="text-[13px] font-bold tabular-nums"
            :class="ui.txTab === tab.id ? 'text-sel-text' : 'text-muted'"
          >
            {{ tab.count }}
          </span>
        </button>
      </div>
    </div>

    <div
      id="transactions-tab-registry"
      role="tabpanel"
      aria-labelledby="transactions-tab-registry-button"
      :hidden="ui.txTab !== 'registry'"
    >
      <NeonRegistry />
    </div>
    <div
      id="transactions-tab-subscriptions"
      role="tabpanel"
      aria-labelledby="transactions-tab-subscriptions-button"
      :hidden="ui.txTab !== 'subscriptions'"
    >
      <NeonSubscriptions ref="subscriptions" />
    </div>
  </section>
</template>

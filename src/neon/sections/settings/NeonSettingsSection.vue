<script setup lang="ts">
import { computed, nextTick, onMounted, ref } from 'vue'

import { useSettingsAssets } from '../../../composables/useSettingsAssets'
import { buildAccountRows } from '../../../domain/settings/view-model'
import { useFinancialStateStore } from '../../../stores/financial-state'
import { useRecurringStore } from '../../../stores/recurring'
import { useStockEventsStore } from '../../../stores/stockevents'
import { useUiStore } from '../../../stores/ui'
import NeonConfirmDialog from '../../ui/NeonConfirmDialog.vue'
import NeonAccountBlock from './NeonAccountBlock.vue'
import NeonAccountsBlock from './NeonAccountsBlock.vue'
import NeonAssetsBlock from './NeonAssetsBlock.vue'
import NeonCategoriesBlock from './NeonCategoriesBlock.vue'
import NeonConnectionsBlock from './NeonConnectionsBlock.vue'
import NeonLiabilitiesBlock from './NeonLiabilitiesBlock.vue'
import NeonPreferencesBlock from './NeonPreferencesBlock.vue'
import NeonRulesBlock from './NeonRulesBlock.vue'
import NeonSecurityBlock from './NeonSecurityBlock.vue'
import type { PendingDeletion } from './deletion'
import { useScrollSpy } from './use-scroll-spy'
import {
  accountsTable,
  alertsLabel,
  assetsTable,
  liabilitiesTable,
  partCounts,
  rulesTable,
  SETTINGS_PARTS,
  type SettingsPartId,
} from './view-model'

// Configuración in the new design (artboard «Configuración · 2560 px», #443):
// one page with an index of its apartados on the left and, on the right, a
// panel with each of them in turn. Tables edit in place; the index follows the
// scroll and takes you to an apartado.
withDefaults(defineProps<{ isActive?: boolean }>(), { isActive: false })

const financialStateStore = useFinancialStateStore()
const recurringStore = useRecurringStore()
const stockEventsStore = useStockEventsStore()
const uiStore = useUiStore()
const { assets } = useSettingsAssets()

const state = computed(() => financialStateStore.state)
const accounts = computed(() =>
  accountsTable(buildAccountRows(state.value), (id) => stockEventsStore.watchlistName(id)),
)
const assetRows = computed(() => assetsTable(assets.value))
const liabilities = computed(() => liabilitiesTable(state.value.liabilities))
const rules = computed(() => rulesTable(recurringStore.rules, state.value.accounts))
const counts = computed(() => partCounts({ ...state.value, recurringRules: recurringStore.rules }))
const alerts = computed(() => alertsLabel(assetRows.value.alerts))

const ids = computed(() => SETTINGS_PARTS.map((part) => `cfg-${part.id}`))
const current = useScrollSpy(ids)

function goTo(id: SettingsPartId): void {
  document.getElementById(`cfg-${id}`)?.scrollIntoView({
    block: 'start',
    behavior: window.matchMedia?.('(prefers-reduced-motion: reduce)').matches ? 'auto' : 'smooth',
  })
}

// Onboarding sends the user to an apartado through the old tab names.
const FROM_TAB: Record<string, SettingsPartId> = {
  categories: 'categorias',
  connections: 'conexiones',
}

onMounted(async () => {
  // The watchlists feed the Stock Events lists the accounts and assets show.
  await stockEventsStore.initializeCredential()
  if (stockEventsStore.credentialConfigured) await stockEventsStore.loadWatchlists()
  const target = FROM_TAB[uiStore.settingsTab]
  if (target) {
    await nextTick()
    goTo(target)
  }
})

const deletion = ref<PendingDeletion | null>(null)
const confirmOpen = computed({
  get: () => deletion.value !== null,
  set: (value: boolean) => {
    if (!value) deletion.value = null
  },
})
// The dialog keeps what it says while it closes.
const shown = ref<PendingDeletion | null>(null)

function ask(request: PendingDeletion): void {
  shown.value = request
  deletion.value = request
}

function confirmDeletion(): void {
  shown.value?.run()
}
</script>

<template>
  <section
    v-show="isActive"
    id="settings"
    class="@container mx-auto grid w-full max-w-[1640px] min-w-0 content-start gap-7"
    aria-labelledby="settings-title"
  >
    <header class="flex flex-wrap items-end justify-between gap-x-6 gap-y-3.5">
      <div class="grid min-w-0 gap-1.5">
        <p class="text-muted text-label tracking-label font-sans font-extrabold uppercase">
          Datos maestros
        </p>
        <h1
          id="settings-title"
          tabindex="-1"
          class="font-display text-[clamp(30px,3.2cqi,44px)] leading-[1.1] font-bold tracking-[-0.03em] outline-none"
        >
          Configuración
        </h1>
        <p class="text-soft text-lede">
          Cada cuenta, activo y regla con todo lo suyo en un solo sitio.
        </p>
      </div>
      <button
        v-if="alerts"
        type="button"
        class="text-text outline-accent inline-flex min-h-11 items-center gap-2.5 px-4 text-[14px] font-extrabold underline underline-offset-4 focus-visible:outline-2 focus-visible:outline-offset-2"
        data-settings-alerts
        @click="goTo('activos')"
      >
        <span class="bg-accent size-2 rounded-full" aria-hidden="true" />
        {{ alerts }}
      </button>
    </header>

    <div class="grid items-start gap-5 @3xl:grid-cols-[232px_minmax(0,1fr)]">
      <nav
        aria-label="Índice de configuración"
        class="flex gap-1 overflow-x-auto @3xl:sticky @3xl:top-6 @3xl:flex-col @3xl:overflow-visible"
      >
        <a
          v-for="part in SETTINGS_PARTS"
          :key="part.id"
          :href="`#cfg-${part.id}`"
          class="outline-accent rounded-field flex min-h-[46px] shrink-0 items-center gap-3 px-3.5 text-[15px] focus-visible:outline-2 focus-visible:outline-offset-2 motion-safe:transition-transform motion-safe:duration-160 motion-safe:active:scale-[0.97]"
          :class="
            current === `cfg-${part.id}`
              ? 'bg-nav-active-bg text-nav-active-text font-bold'
              : 'text-soft pointer-fine:hover:bg-panel2 font-semibold'
          "
          :aria-current="current === `cfg-${part.id}` ? 'location' : undefined"
          @click.prevent="goTo(part.id)"
        >
          <svg
            class="size-5 shrink-0"
            viewBox="0 0 24 24"
            fill="none"
            stroke="currentColor"
            stroke-width="2"
            stroke-linecap="round"
            stroke-linejoin="round"
            aria-hidden="true"
          >
            <path :d="part.icon" />
          </svg>
          <span class="min-w-0 flex-1 truncate">{{ part.label }}</span>
          <span
            v-if="counts[part.id] !== null"
            class="text-muted text-meta shrink-0 font-bold"
            :data-settings-count="part.id"
          >
            {{ counts[part.id] }}
          </span>
        </a>
      </nav>

      <div
        class="bg-panel border-line rounded-card motion-safe:animate-rise min-w-0 border px-6 pbs-1 pbe-[22px]"
      >
        <NeonAccountsBlock :table="accounts" @ask="ask" />
        <NeonAssetsBlock :table="assetRows" @ask="ask" />
        <NeonLiabilitiesBlock :table="liabilities" @ask="ask" />
        <NeonCategoriesBlock @ask="ask" />
        <NeonRulesBlock :table="rules" @ask="ask" />
        <NeonPreferencesBlock />
        <NeonSecurityBlock />
        <NeonConnectionsBlock />
        <NeonAccountBlock />
      </div>
    </div>

    <NeonConfirmDialog
      v-model:open="confirmOpen"
      :title="shown?.title ?? ''"
      :confirm-label="shown?.confirmLabel ?? 'Eliminar'"
      @confirm="confirmDeletion"
    >
      {{ shown?.message }}
    </NeonConfirmDialog>
  </section>
</template>

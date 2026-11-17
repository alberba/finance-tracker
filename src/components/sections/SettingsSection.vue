<script setup lang="ts">
import { computed, defineAsyncComponent, onMounted, reactive, watch } from 'vue'

import SettingsAccountsTab from '../settings/SettingsAccountsTab.vue'
import AppSection from '../ui/AppSection.vue'
import PageHeader from '../ui/PageHeader.vue'
import SectionTabs, { type SectionTab } from '../ui/SectionTabs.vue'
import StatusDot from '../ui/StatusDot.vue'
import { storeToRefs } from 'pinia'
import { useUiStore } from '../../stores/ui'
import { useSettingsAssets } from '../../composables/useSettingsAssets'
import { useFinancialStateStore } from '../../stores/financial-state'
import { useRecurringStore } from '../../stores/recurring'
import { useStockEventsStore } from '../../stores/stockevents'

// Only Cuentas is static; the rest split into chunks and mount on first visit,
// then stay mounted so unsaved state survives tab switches.
const SettingsAssetsTab = defineAsyncComponent(
  () => import('../settings/SettingsAssetsTab.vue'),
)
const SettingsQuotesTab = defineAsyncComponent(
  () => import('../settings/SettingsQuotesTab.vue'),
)
const SettingsLiabilitiesTab = defineAsyncComponent(
  () => import('../settings/SettingsLiabilitiesTab.vue'),
)
const SettingsCategoriesTab = defineAsyncComponent(
  () => import('../settings/SettingsCategoriesTab.vue'),
)
const SettingsRecurringTab = defineAsyncComponent(
  () => import('../settings/SettingsRecurringTab.vue'),
)
const SettingsPreferencesTab = defineAsyncComponent(
  () => import('../settings/SettingsPreferencesTab.vue'),
)
const ConnectionsPanel = defineAsyncComponent(
  () => import('../settings/ConnectionsPanel.vue'),
)

// Configuración by entity: each account, asset and rule with all that hangs
// from it in one card, instead of spread across blocks by feature.
withDefaults(defineProps<{ isActive?: boolean }>(), { isActive: false })

type SettingsTab =
  | 'accounts'
  | 'assets'
  | 'quotes'
  | 'liabilities'
  | 'categories'
  | 'recurring'
  | 'preferences'
  | 'connections'

const financialStateStore = useFinancialStateStore()
const recurringStore = useRecurringStore()
const stockEventsStore = useStockEventsStore()
const { alerts } = useSettingsAssets()

const { settingsTab: activeTab } = storeToRefs(useUiStore())

const tabs = computed<SectionTab[]>(() => {
  const state = financialStateStore.state
  const categories =
    state.incomeCategories.length +
    state.expenseCategories.length +
    state.savingCategories.length +
    state.investmentCategories.length
  const entries: Array<[SettingsTab, string, number | null]> = [
    ['accounts', 'Cuentas', state.accounts.length],
    ['assets', 'Activos', state.investmentAssets.length],
    ['quotes', 'Cotizaciones', state.instruments.length],
    ['liabilities', 'Pasivos', state.liabilities.length],
    ['categories', 'Categorías', categories],
    [
      'recurring',
      'Recurrentes',
      recurringStore.rules.filter((rule) => rule.type !== 'investment').length,
    ],
    ['preferences', 'Preferencias', null],
    ['connections', 'Conexiones', null],
  ]
  return entries.map(([id, label, count]) => ({
    id,
    label,
    count,
    buttonId: `settings-tab-${id}-button`,
  }))
})

// The watchlists feed the list selects of accounts and assets.
onMounted(async () => {
  await stockEventsStore.initializeCredential()
  if (stockEventsStore.credentialConfigured) await stockEventsStore.loadWatchlists()
})

const visitedTabs = reactive(new Set<string>())
watch(
  activeTab,
  (tab) => {
    visitedTabs.add(tab)
  },
  { immediate: true },
)
</script>

<template>
  <AppSection id="settings" :is-active="isActive">
    <div class="mx-auto grid w-full max-w-7xl min-w-0 gap-6 sm:gap-7">
      <PageHeader
        kicker="Datos maestros"
        title="Configuración"
        title-id="settings-title"
        lede="Cuentas, agrupaciones de inversión, cotizaciones por símbolo y reglas."
      >
        <template v-if="alerts" #aside>
          <button
            type="button"
            class="text-text-muted hover:text-text-main min-h-11 text-sm"
            data-settings-alerts
            @click="activeTab = 'assets'"
          >
            <StatusDot
              tone="warn"
              :label="alerts === 1 ? '1 aviso en Activos' : `${alerts} avisos en Activos`"
            />
          </button>
        </template>
      </PageHeader>

      <SectionTabs
        v-model="activeTab"
        :tabs="tabs"
        label="Apartados de configuración"
        panel-id-prefix="settings-tab-"
        data-key="settings-tab"
      />

      <SettingsAccountsTab :is-active="activeTab === 'accounts'" />
      <SettingsAssetsTab v-if="visitedTabs.has('assets')" :is-active="activeTab === 'assets'" />
      <SettingsQuotesTab v-if="visitedTabs.has('quotes')" :is-active="activeTab === 'quotes'" />
      <SettingsLiabilitiesTab
        v-if="visitedTabs.has('liabilities')"
        :is-active="activeTab === 'liabilities'"
      />
      <SettingsCategoriesTab
        v-if="visitedTabs.has('categories')"
        :is-active="activeTab === 'categories'"
      />
      <SettingsRecurringTab
        v-if="visitedTabs.has('recurring')"
        :is-active="activeTab === 'recurring'"
      />
      <SettingsPreferencesTab
        v-if="visitedTabs.has('preferences')"
        :is-active="activeTab === 'preferences'"
      />
      <ConnectionsPanel
        v-if="visitedTabs.has('connections')"
        :is-active="activeTab === 'connections'"
      />
    </div>
  </AppSection>
</template>

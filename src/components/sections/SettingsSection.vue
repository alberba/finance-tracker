<script setup lang="ts">
import { computed, onMounted, ref } from 'vue'

import ConnectionsPanel from '../settings/ConnectionsPanel.vue'
import SettingsAccountsTab from '../settings/SettingsAccountsTab.vue'
import SettingsAssetsTab from '../settings/SettingsAssetsTab.vue'
import SettingsCategoriesTab from '../settings/SettingsCategoriesTab.vue'
import SettingsLiabilitiesTab from '../settings/SettingsLiabilitiesTab.vue'
import SettingsPreferencesTab from '../settings/SettingsPreferencesTab.vue'
import SettingsRecurringTab from '../settings/SettingsRecurringTab.vue'
import AppSection from '../ui/AppSection.vue'
import PageHeader from '../ui/PageHeader.vue'
import SectionTabs, { type SectionTab } from '../ui/SectionTabs.vue'
import StatusDot from '../ui/StatusDot.vue'
import { useSettingsAssets } from '../../composables/useSettingsAssets'
import { useFinancialStateStore } from '../../stores/financial-state'
import { useRecurringStore } from '../../stores/recurring'
import { useStockEventsStore } from '../../stores/stockevents'

// Configuración by entity: each account, asset and rule with all that hangs
// from it in one card, instead of spread across blocks by feature.
withDefaults(defineProps<{ isActive?: boolean }>(), { isActive: false })

type SettingsTab =
  'accounts' | 'assets' | 'liabilities' | 'categories' | 'recurring' | 'preferences' | 'connections'

const financialStateStore = useFinancialStateStore()
const recurringStore = useRecurringStore()
const stockEventsStore = useStockEventsStore()
const { alerts } = useSettingsAssets()

const activeTab = ref<string>('accounts')

const tabs = computed<SectionTab[]>(() => {
  const state = financialStateStore.state
  const categories =
    state.incomeCategories.length +
    state.expenseCategories.length +
    state.investmentCategories.length
  const entries: Array<[SettingsTab, string, number | null]> = [
    ['accounts', 'Cuentas', state.accounts.length],
    ['assets', 'Activos', state.investmentAssets.length],
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
</script>

<template>
  <AppSection id="settings" :is-active="isActive">
    <div class="mx-auto grid w-full max-w-7xl min-w-0 gap-6 sm:gap-7">
      <PageHeader
        kicker="Datos maestros"
        title="Configuración"
        title-id="settings-title"
        lede="Cada cuenta, activo y regla con todo lo suyo en un solo sitio."
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
      <SettingsAssetsTab :is-active="activeTab === 'assets'" />
      <SettingsLiabilitiesTab :is-active="activeTab === 'liabilities'" />
      <SettingsCategoriesTab :is-active="activeTab === 'categories'" />
      <SettingsRecurringTab :is-active="activeTab === 'recurring'" />
      <SettingsPreferencesTab :is-active="activeTab === 'preferences'" />
      <ConnectionsPanel :is-active="activeTab === 'connections'" />
    </div>
  </AppSection>
</template>

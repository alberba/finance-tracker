<script setup lang="ts">
import SetupRequirement from '../onboarding/SetupRequirement.vue'
import { useAccountRequirement } from '../../composables/useAccountRequirement'
import { computed, useTemplateRef, watch } from 'vue'

import AppSection from '../ui/AppSection.vue'
import BaseButton from '../ui/BaseButton.vue'
import PageHeader from '../ui/PageHeader.vue'
import SectionTabs from '../ui/SectionTabs.vue'
import SubscriptionPanel from '../transactions/SubscriptionPanel.vue'
import SubscriptionsTab from '../transactions/SubscriptionsTab.vue'
import TransactionPanel from '../transactions/TransactionPanel.vue'
import TransactionsRegistry from '../transactions/TransactionsRegistry.vue'
import type { TransactionsSubTab } from '../../scripts/types'
import { useMovementsStore } from '../../stores/movements'
import { useUiStore } from '../../stores/ui'

withDefaults(defineProps<{ isActive?: boolean }>(), { isActive: false })

const movementsStore = useMovementsStore()
const uiStore = useUiStore()
const ui = uiStore.ui
const transactionPanel = useTemplateRef<InstanceType<typeof TransactionPanel>>('transactionPanel')
const subscriptionPanel =
  useTemplateRef<InstanceType<typeof SubscriptionPanel>>('subscriptionPanel')

const tab = computed<string>({
  get: () => ui.txTab,
  set: (value) => {
    ui.txTab = value as TransactionsSubTab
  },
})
const tabs = computed(() => [
  {
    id: 'registry',
    label: 'Registro',
    count: movementsStore.yearCount,
    buttonId: 'transactions-tab-registry-button',
  },
  {
    id: 'subscriptions',
    label: 'Suscripciones',
    count: movementsStore.subscriptions.length,
    buttonId: 'transactions-tab-subscriptions-button',
  },
])

function createNew(): void {
  if (needsAccount.value) return
  if (ui.txTab === 'subscriptions') subscriptionPanel.value?.openNew()
  else transactionPanel.value?.openNew()
}
const { needsAccount } = useAccountRequirement()

watch(
  [() => uiStore.setupAction, transactionPanel],
  ([action, panel]) => {
    if (action !== 'movement' || !panel) return
    uiStore.setupAction = null
    panel.openNew()
  },
  { immediate: true, flush: 'post' },
)
</script>

<template>
  <AppSection id="transactions" :is-active="isActive">
    <div class="mx-auto grid w-full max-w-7xl min-w-0 gap-6 sm:gap-7">
      <PageHeader
        kicker="Registro diario"
        title="Movimientos"
        title-id="transactions-title"
        lede="Lo que entra, lo que sale y lo que inviertes, mes a mes."
      >
        <template #aside>
          <BaseButton
            id="tx-open-modal"
            variant="primary"
            :disabled="needsAccount"
            @click="createNew"
          >
            <svg
              class="size-4"
              viewBox="0 0 24 24"
              fill="none"
              stroke="currentColor"
              stroke-width="2.4"
              stroke-linecap="round"
              aria-hidden="true"
            >
              <path d="M12 5v14M5 12h14" />
            </svg>
            {{ ui.txTab === 'subscriptions' ? 'Nueva suscripción' : 'Nuevo movimiento' }}
          </BaseButton>
        </template>
      </PageHeader>

      <SetupRequirement
        v-if="needsAccount"
        message="Crea una cuenta para registrar movimientos y suscripciones."
      />

      <SectionTabs
        v-model="tab"
        :tabs="tabs"
        label="Subsecciones de movimientos"
        panel-id-prefix="transactions-tab-"
        data-key="tx-tab"
      />

      <div
        id="transactions-tab-registry"
        role="tabpanel"
        aria-labelledby="transactions-tab-registry-button"
        :hidden="ui.txTab !== 'registry'"
      >
        <TransactionsRegistry @edit="transactionPanel?.openEdit($event)" />
      </div>
      <div
        id="transactions-tab-subscriptions"
        role="tabpanel"
        aria-labelledby="transactions-tab-subscriptions-button"
        :hidden="ui.txTab !== 'subscriptions'"
      >
        <SubscriptionsTab @edit="subscriptionPanel?.openEdit($event)" />
      </div>
    </div>

    <TransactionPanel ref="transactionPanel" />
    <SubscriptionPanel ref="subscriptionPanel" />
  </AppSection>
</template>

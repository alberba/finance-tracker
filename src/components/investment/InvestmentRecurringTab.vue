<script setup lang="ts">
import InvestmentRecurringRulesPanel from './recurring/InvestmentRecurringRulesPanel.vue'

defineProps<{ isActive: boolean }>()
</script>

<template>
  <div
    id="investment-tab-recurring"
    class="investment-subtab-panel"
    :class="{ 'is-active': isActive }"
    :hidden="!isActive"
    data-investment-tab-panel="recurring"
    role="tabpanel"
    aria-labelledby="investment-tab-recurring-button"
  >
    <InvestmentRecurringRulesPanel />
  </div>
</template>

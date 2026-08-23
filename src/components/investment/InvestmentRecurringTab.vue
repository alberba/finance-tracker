<script setup lang="ts">
import InvestmentRecurringRulesPanel from './recurring/InvestmentRecurringRulesPanel.vue'

defineProps<{ isActive: boolean }>()
</script>

<template>
  <section
    id="investment-tab-recurring"
    :hidden="!isActive"
    role="tabpanel"
    aria-labelledby="investment-tab-recurring-button"
  >
    <InvestmentRecurringRulesPanel />
  </section>
</template>

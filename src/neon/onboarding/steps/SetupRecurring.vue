<script setup lang="ts">
import { computed, ref } from 'vue'

import { useFinancialStateStore } from '../../../stores/financial-state'
import { useRecurringStore } from '../../../stores/recurring'
import NeonRuleFormPanel from '../../sections/settings/NeonRuleFormPanel.vue'
import { rulesTable } from '../../sections/settings/view-model'
import NeonFigure from '../../ui/NeonFigure.vue'

// «Ingresos y gastos fijos»: the recurring rules, created with the same panel
// as in Configuración, which opens over the wizard.
const financial = useFinancialStateStore()
const recurringStore = useRecurringStore()
const table = computed(() => rulesTable(recurringStore.rules, financial.state.accounts))
const panelOpen = ref(false)
</script>

<template>
  <div class="grid gap-3">
    <div v-if="table.rows.length" class="bg-panel border-line rounded-card border">
      <ul class="frame:px-7 divide-line grid divide-y px-4 py-1" aria-label="Fijos creados">
        <li v-for="row in table.rows" :key="row.id" class="flex min-h-[68px] items-center gap-3.5">
          <div class="grid min-w-0 flex-1">
            <span class="truncate text-[16px] font-bold">{{ row.name }}</span>
            <span class="text-muted text-meta truncate"
              >{{ row.frequency }} · {{ row.detail }}</span
            >
          </div>
          <NeonFigure
            :value="row.amount"
            class="text-end text-[16px] font-semibold"
            :class="row.income ? 'text-gain' : ''"
          />
        </li>
      </ul>
      <p class="border-line text-muted text-meta frame:px-7 border-t px-4 py-3">
        Al mes: {{ table.netText }}
      </p>
    </div>

    <button
      type="button"
      class="border-line rounded-card text-text outline-accent flex min-h-15 items-center gap-3 border border-dashed px-4 text-[15px] font-extrabold focus-visible:outline-2"
      @click="panelOpen = true"
    >
      <svg
        viewBox="0 0 24 24"
        class="size-5"
        fill="none"
        stroke="currentColor"
        stroke-width="2"
        stroke-linecap="round"
        aria-hidden="true"
      >
        <path d="M12 5v14M5 12h14" />
      </svg>
      Añadir un fijo
    </button>

    <NeonRuleFormPanel v-model:open="panelOpen" description="" />
  </div>
</template>

<script setup lang="ts">
import { storeToRefs } from 'pinia'

import { useSettingsStore } from '../../../stores/settings'
import type { PendingDeletion } from './deletion'
import NeonCategoryList from './NeonCategoryList.vue'
import NeonSettingsBlock from './NeonSettingsBlock.vue'

// Categorías: what movements are classified with, three lists side by side.
// The order is the one the selects of the whole app show.
const emit = defineEmits<{ ask: [deletion: PendingDeletion] }>()
const { viewModel } = storeToRefs(useSettingsStore())
</script>

<template>
  <NeonSettingsBlock
    id="categorias"
    title="Categorías"
    description="Con qué se clasifican los movimientos. El orden es el de los desplegables."
  >
    <div class="grid grid-cols-[repeat(auto-fit,minmax(260px,1fr))] items-start gap-x-8 gap-y-6">
      <NeonCategoryList
        title="Ingresos"
        noun="de ingresos"
        category-key="incomeCategories"
        :tags="viewModel.incomeCategories"
        @ask="emit('ask', $event)"
      />
      <NeonCategoryList
        title="Gastos"
        noun="de gastos"
        category-key="expenseCategories"
        :tags="viewModel.expenseCategories"
        @ask="emit('ask', $event)"
      />
      <NeonCategoryList
        title="Inversión"
        noun="de inversión"
        category-key="investmentCategories"
        :tags="viewModel.investmentCategories"
        @ask="emit('ask', $event)"
      />
    </div>
  </NeonSettingsBlock>
</template>

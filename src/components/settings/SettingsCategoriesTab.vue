<script setup lang="ts">
import { storeToRefs } from 'pinia'

import SettingsCategoryList from './SettingsCategoryList.vue'
import SettingsTabIntro from './SettingsTabIntro.vue'
import { useSettingsStore } from '../../stores/settings'

// Categorías: the three lists side by side, each in the order of its selects.
defineProps<{ isActive: boolean }>()

const { viewModel } = storeToRefs(useSettingsStore())
</script>

<template>
  <section
    id="settings-tab-categories"
    class="grid content-start gap-6"
    :hidden="!isActive"
    role="tabpanel"
    aria-labelledby="settings-tab-categories-button"
    data-settings-categories
  >
    <SettingsTabIntro
      title="Categorías"
      description="Con qué se clasifican los movimientos. El orden es el de los desplegables."
    />
    <div
      class="border-line bg-panel shadow-soft grid gap-x-10 gap-y-8 rounded-lg border px-5 py-6 sm:px-7 lg:grid-cols-3"
    >
      <SettingsCategoryList
        title="Ingresos"
        category-key="incomeCategories"
        :tags="viewModel.incomeCategories"
      />
      <SettingsCategoryList
        title="Gastos"
        category-key="expenseCategories"
        :tags="viewModel.expenseCategories"
      />
      <SettingsCategoryList
        title="Inversión"
        category-key="investmentCategories"
        :tags="viewModel.investmentCategories"
      />
    </div>
  </section>
</template>

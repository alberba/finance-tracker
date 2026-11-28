<script setup lang="ts">
import { storeToRefs } from 'pinia'
import { computed, ref } from 'vue'

import { useSettingsStore } from '../../../stores/settings'
import type { PendingDeletion } from '../../sections/settings/deletion'
import NeonCategoryList from '../../sections/settings/NeonCategoryList.vue'
import NeonConfirmDialog from '../../ui/NeonConfirmDialog.vue'

// «Categorías»: the income and expense lists of Configuración, where the
// suggested ones can be removed and new ones added.
const { viewModel } = storeToRefs(useSettingsStore())

const deletion = ref<PendingDeletion | null>(null)
// The dialog keeps what it says while it closes.
const shown = ref<PendingDeletion | null>(null)
const confirmOpen = computed({
  get: () => deletion.value !== null,
  set: (value: boolean) => {
    if (!value) deletion.value = null
  },
})

function ask(request: PendingDeletion): void {
  shown.value = request
  deletion.value = request
}

function confirm(): void {
  shown.value?.run()
}
</script>

<template>
  <div class="bg-panel border-line rounded-card frame:p-8 border p-4">
    <div class="grid grid-cols-[repeat(auto-fit,minmax(260px,1fr))] items-start gap-x-8 gap-y-6">
      <NeonCategoryList
        title="Ingresos"
        noun="de ingresos"
        category-key="incomeCategories"
        :tags="viewModel.incomeCategories"
        @ask="ask"
      />
      <NeonCategoryList
        title="Gastos"
        noun="de gastos"
        category-key="expenseCategories"
        :tags="viewModel.expenseCategories"
        @ask="ask"
      />
    </div>
    <NeonConfirmDialog
      v-model:open="confirmOpen"
      :title="shown?.title ?? ''"
      :confirm-label="shown?.confirmLabel ?? 'Eliminar'"
      @confirm="confirm"
    >
      {{ shown?.message }}
    </NeonConfirmDialog>
  </div>
</template>

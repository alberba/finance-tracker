<script setup lang="ts">
import { computed } from 'vue'

import BaseButton from '../ui/BaseButton.vue'
import BaseInput from '../ui/BaseInput.vue'
import BaseSelect from '../ui/BaseSelect.vue'
import FilterChip from '../ui/FilterChip.vue'
import { TYPE_DOT, TYPE_PLURAL } from './transaction-types'
import { TRANSACTION_TYPES, type TransactionType } from '../../scripts/types'
import { useMovementsStore } from '../../stores/movements'
import { useUiStore } from '../../stores/ui'

// Narrows the registry: year, free text, type chips and account. «Exportar»
// asks the registry to open the report for what the filters leave.
const movementsStore = useMovementsStore()
const ui = useUiStore().ui
const filters = ui.txFilters

const emit = defineEmits<{ export: [] }>()

const yearOptions = computed(() =>
  movementsStore.years.map((year) => ({ value: year, label: String(year) })),
)
const year = computed({
  get: () => ui.txYear,
  set: (value: number) => movementsStore.setYear(value),
})
const accountOptions = computed(() => [
  { value: '', label: 'Todas las cuentas' },
  ...movementsStore.accounts.map((account) => ({ value: account.id, label: account.name })),
])
const account = computed({
  get: () => filters.accountIds[0] ?? '',
  set: (value: string) => {
    filters.accountIds = value ? [value] : []
  },
})

function isOn(type: TransactionType): boolean {
  return filters.types.includes(type)
}

// A chip on adds its type to the union; off removes it. No type chosen shows
// every type, so turning the last chip off goes back to showing them all.
function setType(type: TransactionType, on: boolean): void {
  const chosen = filters.types.filter((item) => item !== type)
  if (on) chosen.push(type)
  filters.types = TRANSACTION_TYPES.filter((item) => chosen.includes(item))
}
</script>

<template>
  <div class="grid gap-3" data-registry-toolbar>
    <div class="flex flex-wrap items-end gap-3">
      <BaseSelect
        v-model="year"
        class="w-28"
        label="Año"
        hide-label
        name="txYear"
        :options="yearOptions"
      />
      <BaseInput
        v-model="filters.search"
        class="min-w-56 flex-1"
        label="Buscar movimientos"
        hide-label
        type="search"
        name="txSearch"
        placeholder="Descripción o categoría"
      >
        <template #leading>
          <svg
            class="size-4"
            viewBox="0 0 24 24"
            fill="none"
            stroke="currentColor"
            stroke-width="2"
            stroke-linecap="round"
          >
            <circle cx="11" cy="11" r="7" />
            <path d="M20 20l-3.5-3.5" />
          </svg>
        </template>
      </BaseInput>
      <div class="flex flex-wrap gap-2" role="group" aria-label="Filtrar por tipo">
        <FilterChip
          v-for="type in TRANSACTION_TYPES"
          :key="type"
          :model-value="isOn(type)"
          :label="TYPE_PLURAL[type]"
          :dot="TYPE_DOT[type]"
          :data-type-chip="type"
          @update:model-value="setType(type, $event)"
        />
      </div>
      <div class="flex w-full items-end gap-3 sm:w-auto">
        <BaseSelect
          v-model="account"
          class="min-w-0 flex-1 sm:w-48 sm:flex-none"
          label="Cuenta"
          hide-label
          name="txAccount"
          :options="accountOptions"
        />
        <BaseButton id="tx-export" variant="ghost" class="shrink-0" @click="emit('export')">
          <svg
            class="size-4"
            viewBox="0 0 24 24"
            fill="none"
            stroke="currentColor"
            stroke-width="2"
            stroke-linecap="round"
            stroke-linejoin="round"
            aria-hidden="true"
          >
            <path d="M12 4v11M7 10l5 5 5-5M5 20h14" />
          </svg>
          Exportar
        </BaseButton>
      </div>
    </div>
  </div>
</template>

<script setup lang="ts">
import { computed, ref } from 'vue'

import BaseButton from '../ui/BaseButton.vue'
import BaseInput from '../ui/BaseInput.vue'
import BaseSelect from '../ui/BaseSelect.vue'
import FilterChip from '../ui/FilterChip.vue'
import { TYPE_DOT, TYPE_PLURAL } from './transaction-types'
import { TRANSACTION_TYPES, type TransactionType } from '../../scripts/types'
import { useMovementsStore } from '../../stores/movements'
import { useUiStore } from '../../stores/ui'

// Narrows the registry: year, free text, type chips, account, and the
// amount and date filters behind a disclosure.
const movementsStore = useMovementsStore()
const ui = useUiStore().ui
const filters = ui.txFilters

const showMore = ref(false)

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
const extraFilterCount = computed(
  () => [filters.date, filters.amountMin, filters.amountMax].filter(Boolean).length,
)

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

function clearExtra(): void {
  filters.date = ''
  filters.amountMin = ''
  filters.amountMax = ''
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
      <BaseSelect
        v-model="account"
        class="w-48"
        label="Cuenta"
        hide-label
        name="txAccount"
        :options="accountOptions"
      />
      <BaseButton
        variant="ghost"
        :aria-expanded="showMore"
        aria-controls="tx-extra-filters"
        @click="showMore = !showMore"
      >
        Importe y fecha
        <span v-if="extraFilterCount" class="text-primary tabular-nums"
          >· {{ extraFilterCount }}</span
        >
      </BaseButton>
    </div>
    <div
      v-show="showMore"
      id="tx-extra-filters"
      class="bg-subtle flex flex-wrap items-end gap-3 rounded-md p-3"
    >
      <BaseInput v-model="filters.date" class="w-44" label="Fecha exacta" type="date" />
      <BaseInput
        v-model="filters.amountMin"
        class="w-36"
        label="Importe mín."
        inputmode="decimal"
        suffix="€"
      />
      <BaseInput
        v-model="filters.amountMax"
        class="w-36"
        label="Importe máx."
        inputmode="decimal"
        suffix="€"
      />
      <BaseButton variant="ghost" :disabled="!extraFilterCount" @click="clearExtra"
        >Limpiar</BaseButton
      >
    </div>
  </div>
</template>

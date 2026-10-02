<script setup lang="ts">
import { computed, reactive, watch } from 'vue'

import BaseButton from '../ui/BaseButton.vue'
import BaseSelect from '../ui/BaseSelect.vue'
import IconButton from '../ui/IconButton.vue'
import { TYPE_OPTIONS } from './transaction-types'
import { useMoneyFormatter } from '../../composables/useMoneyFormatter'
import type { TransactionType } from '../../scripts/types'
import { useMovementsStore } from '../../stores/movements'

// Bulk actions as a contextual bar over the page while rows are selected:
// change type, account or category of the selection, or delete it.
defineProps<{ visible: boolean }>()
const emit = defineEmits<{ close: [] }>()

const movementsStore = useMovementsStore()
const { formatSignedMoney } = useMoneyFormatter()
const bulk = reactive({ type: '' as TransactionType | '', accountId: '', category: '' })

const count = computed(() => movementsStore.selectedTransactions.length)
const countLabel = computed(
  () => `${count.value} ${count.value === 1 ? 'seleccionado' : 'seleccionados'}`,
)

// The empty first option means "leave as it is"; its short text fits on a phone.
const typeOptions = [{ value: '', label: 'Tipo' }, ...TYPE_OPTIONS]
const accountOptions = computed(() => [
  { value: '', label: 'Cuenta' },
  ...movementsStore.accounts.map((account) => ({ value: account.id, label: account.name })),
])

// Categories belong to a type: the new one, or the one the selection shares.
const categoryType = computed<TransactionType | null>(() => {
  if (bulk.type) return bulk.type
  const types = new Set(movementsStore.selectedTransactions.map((tx) => tx.type))
  return types.size === 1 ? [...types][0] : null
})
const categoryOptions = computed(() => [
  { value: '', label: 'Categoría' },
  ...(categoryType.value ? movementsStore.orderedCategories(categoryType.value) : []).map(
    (name) => ({
      value: name,
      label: name,
    }),
  ),
])

watch(categoryOptions, (options) => {
  if (!options.some((option) => option.value === bulk.category)) bulk.category = ''
})

function apply(): void {
  movementsStore.applyBulkChanges({ ...bulk })
  bulk.type = ''
  bulk.accountId = ''
  bulk.category = ''
}

function close(): void {
  movementsStore.clearSelection()
  emit('close')
}
</script>

<template>
  <div
    v-if="visible"
    class="bg-ink border-ink-line text-ink-text shadow-raised fixed inset-x-3 bottom-3 z-60 grid gap-3 rounded-lg border p-3 sm:inset-x-auto sm:left-1/2 sm:flex sm:-translate-x-1/2 sm:items-center sm:px-4 lg:ml-32"
    role="region"
    aria-label="Acciones sobre la selección"
    data-bulk-bar
  >
    <div class="flex items-center justify-between gap-3 sm:contents">
      <p id="tx-selected-count" class="grid px-1 font-semibold whitespace-nowrap">
        {{ countLabel }}
        <span class="font-display text-ink-muted text-sm font-normal tabular-nums">
          {{ formatSignedMoney(movementsStore.selectedSum) }}
        </span>
      </p>
      <IconButton
        class="sm:order-last"
        icon="close"
        tone="ink"
        label="Quitar la selección"
        @click="close"
      />
    </div>
    <div class="grid grid-cols-3 gap-2 sm:flex">
      <BaseSelect
        id="tx-bulk-type"
        v-model="bulk.type"
        class="sm:w-44"
        label="Cambiar tipo"
        hide-label
        :options="typeOptions"
      />
      <BaseSelect
        id="tx-bulk-account"
        v-model="bulk.accountId"
        class="sm:w-48"
        label="Mover a cuenta"
        hide-label
        :options="accountOptions"
      />
      <BaseSelect
        id="tx-bulk-category"
        v-model="bulk.category"
        class="sm:w-52"
        label="Cambiar categoría"
        hide-label
        :disabled="!categoryType"
        :options="categoryOptions"
      />
    </div>
    <div class="grid grid-cols-2 gap-2 sm:flex">
      <BaseButton id="tx-bulk-apply" variant="primary" :disabled="!count" @click="apply">
        Aplicar
      </BaseButton>
      <BaseButton
        id="tx-bulk-delete"
        variant="ink-danger"
        :disabled="!count"
        @click="movementsStore.deleteSelected()"
      >
        Eliminar
      </BaseButton>
    </div>
  </div>
</template>

import { computed, type Ref } from 'vue'

import { useMovementsStore } from '../../../stores/movements'
import { useUiStore } from '../../../stores/ui'
import type { FilterOption } from './NeonFilterChip.vue'
import { swapLedger } from './ledger-swap'
import { chosenType, TYPE_CHIPS, type ExtraFilters } from './registry-view-model'

const TYPE_DOT: Record<string, string> = {
  expense: 'bg-text',
  income: 'bg-gain',
  saving: 'bg-peach',
  investment: 'bg-lilac',
}

/**
 * The registry's filters as choices: the type and the account (shared with the
 * old design, in the UI store) and the design's own `extra` (day, amounts,
 * category). Each change swaps the ledger (ledger-swap.ts). Used by the chips
 * of the desktop and by the phone's filter sheet.
 */
export function useRegistryFilters(extra: Ref<ExtraFilters>) {
  const movementsStore = useMovementsStore()
  const filters = useUiStore().ui.txFilters

  const typeOptions: FilterOption[] = [
    { value: '', label: 'Todos' },
    ...TYPE_CHIPS.map((chip) => ({ ...chip, dot: TYPE_DOT[chip.value] })),
  ]
  const type = computed(() => chosenType(filters.types) ?? '')
  const typeLabel = computed(
    () => typeOptions.find((option) => option.value === type.value)?.label ?? 'Todos',
  )

  const accountOptions = computed<FilterOption[]>(() => [
    { value: '', label: 'Todas' },
    ...movementsStore.accounts.map((account) => ({ value: account.id, label: account.name })),
  ])
  const account = computed(() => filters.accountIds[0] ?? '')
  const accountLabel = computed(
    () => accountOptions.value.find((option) => option.value === account.value)?.label ?? 'Todas',
  )

  function setType(value: string): void {
    swapLedger(() => {
      filters.types = value ? [value as (typeof TYPE_CHIPS)[number]['value']] : []
    })
  }

  function setAccount(value: string): void {
    swapLedger(() => {
      filters.accountIds = value ? [value] : []
    })
  }

  function setExtra(key: keyof ExtraFilters, value: string): void {
    extra.value = { ...extra.value, [key]: value }
  }

  function clearExtra(keys: Array<keyof ExtraFilters>): void {
    swapLedger(() => {
      extra.value = { ...extra.value, ...Object.fromEntries(keys.map((key) => [key, ''])) }
    })
  }

  return {
    filters,
    typeOptions,
    type,
    typeLabel,
    accountOptions,
    account,
    accountLabel,
    setType,
    setAccount,
    setExtra,
    clearExtra,
  }
}

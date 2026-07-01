import { defineStore } from 'pinia'
import { computed } from 'vue'

import { useToast } from '../composables/useToast'
import { getOrderedCategoriesForType } from '../domain/transactions/categories'
import {
  buildAccountFilterOptions,
  buildMonthBreakdown,
  filterAndSortTransactions,
} from '../scripts/transactions'
import {
  isTransactionType,
  type BudgetType,
  type Transaction,
  type TransactionType,
  type TxSortColumn,
} from '../scripts/types'
import { monthFromISO, parseFloatSafe, round2, uid } from '../scripts/utils'
import { useFinancialStateStore } from './financial-state'
import { useUiStore } from './ui'

const TYPE_FILTER_OPTIONS = [
  { value: 'income', label: 'Ingreso' },
  { value: 'expense', label: 'Gasto' },
  { value: 'investment', label: 'Inversión' },
] as const

export interface NewTransactionInput {
  date: string
  month: number
  type: TransactionType
  accountId: string
  category: string
  description: string
  amount: number
}

export interface EditedTransactionInput {
  date: string
  accountId: string
  type: string
  category: string
  description: string
  amount: string
}

export interface BulkTransactionChanges {
  type: string
  accountId: string
  category: string
}

export const useMovementsStore = defineStore('movements', () => {
  const financialStateStore = useFinancialStateStore()
  const uiStore = useUiStore()
  const { showToast } = useToast()
  const ui = uiStore.ui

  const accountNameById = computed(() => {
    const map = new Map<string, string>()
    financialStateStore.accounts.forEach((account) => map.set(account.id, account.name))
    return map
  })

  function getAccountName(accountId: string): string {
    return accountNameById.value.get(accountId) || accountId || '-'
  }

  const accounts = computed(() => financialStateStore.accounts)

  const visibleTransactions = computed(() =>
    filterAndSortTransactions({
      transactions: financialStateStore.transactions,
      month: ui.txFilterMonth,
      filters: ui.txFilters,
      sort: ui.txSort,
      getAccountName,
    }),
  )

  const breakdown = computed(() =>
    buildMonthBreakdown({
      transactions: financialStateStore.transactions,
      month: ui.txFilterMonth,
      incomeCategories: financialStateStore.state.incomeCategories,
      expenseCategories: financialStateStore.state.expenseCategories,
      investmentCategories: financialStateStore.state.investmentCategories,
    }),
  )

  const accountFilterOptions = computed(() =>
    buildAccountFilterOptions({
      transactions: financialStateStore.transactions,
      month: ui.txFilterMonth,
      getAccountName,
    }),
  )

  const typeFilterOptions = TYPE_FILTER_OPTIONS

  const selectedVisibleCount = computed(
    () => visibleTransactions.value.filter((item) => ui.txSelectedIds.includes(item.id)).length,
  )
  const allVisibleSelected = computed(
    () =>
      visibleTransactions.value.length > 0 &&
      selectedVisibleCount.value === visibleTransactions.value.length,
  )

  function orderedCategories(type: BudgetType): string[] {
    return getOrderedCategoriesForType(financialStateStore.state, type)
  }

  function setMonth(month: number): void {
    ui.txFilterMonth = month
    ui.txSelectedIds = []
    ui.txEditingId = ''
  }

  function toggleSort(column: TxSortColumn): void {
    if (ui.txSort.column === column) {
      ui.txSort.direction = ui.txSort.direction === 'asc' ? 'desc' : 'asc'
    } else {
      ui.txSort.column = column
      ui.txSort.direction = column === 'date' || column === 'amount' ? 'desc' : 'asc'
    }
  }

  function toggleFilterPopover(column: TxSortColumn): void {
    ui.txOpenHeaderFilter = ui.txOpenHeaderFilter === column ? '' : column
  }

  function closeFilterPopover(): void {
    ui.txOpenHeaderFilter = ''
  }

  function clearFilterColumn(column: TxSortColumn): void {
    if (column === 'date') {
      ui.txFilters.date = ''
    } else if (column === 'account') {
      ui.txFilters.accountIds = []
    } else if (column === 'type') {
      ui.txFilters.types = []
    } else if (column === 'category') {
      ui.txFilters.category = ''
    } else if (column === 'description') {
      ui.txFilters.description = ''
    } else if (column === 'amount') {
      ui.txFilters.amountMin = ''
      ui.txFilters.amountMax = ''
    }
    ui.txOpenHeaderFilter = ''
    ui.txEditingId = ''
    ui.txSelectedIds = []
  }

  function setSelected(id: string, selected: boolean): void {
    const next = new Set(ui.txSelectedIds)
    if (selected) {
      next.add(id)
    } else {
      next.delete(id)
    }
    ui.txSelectedIds = Array.from(next)
  }

  function setAllSelected(selected: boolean): void {
    ui.txSelectedIds = selected ? visibleTransactions.value.map((item) => item.id) : []
  }

  function startEdit(id: string): void {
    ui.txEditingId = id
    ui.txSelectedIds = []
  }

  function cancelEdit(): void {
    ui.txEditingId = ''
  }

  function addTransaction(input: NewTransactionInput): boolean {
    if (input.amount <= 0) {
      showToast('El importe debe ser mayor que 0.')
      return false
    }

    financialStateStore.commitState((draft) => {
      draft.transactions.push({
        id: uid('tx'),
        date: input.date,
        month: input.month,
        type: input.type,
        accountId: input.accountId,
        category: input.category || 'Sin categoría',
        description: input.description.trim(),
        amount: round2(input.amount),
      })
    })
    return true
  }

  function saveEdit(id: string, fields: EditedTransactionInput): boolean {
    const date = fields.date.trim()
    const accountId = fields.accountId.trim()
    const type = fields.type.trim()
    const category = fields.category.trim()
    const description = fields.description.trim()
    const amount = parseFloatSafe(fields.amount, 0)

    const requiresPositiveAmount = type !== 'investment'
    const invalidAmount = requiresPositiveAmount ? amount <= 0 : amount === 0

    if (!date || !accountId || !type || !category || invalidAmount || !isTransactionType(type)) {
      showToast('Completa fecha, cuenta, tipo, categoría e importe válido.')
      return false
    }

    financialStateStore.commitState((draft) => {
      const tx = draft.transactions.find((item): item is Transaction => item.id === id)
      if (!tx) {
        return
      }
      tx.date = date
      tx.month = monthFromISO(date) ?? tx.month
      tx.accountId = accountId
      tx.type = type
      tx.category = category
      tx.description = description
      tx.amount = round2(amount)
    })

    ui.txEditingId = ''
    ui.investmentTxEditingId = ''
    showToast('Movimiento actualizado.')
    return true
  }

  function deleteTransaction(id: string): void {
    financialStateStore.commitState((draft) => {
      draft.transactions = draft.transactions.filter((item) => item.id !== id)
    })
    ui.txSelectedIds = ui.txSelectedIds.filter((itemId) => itemId !== id)
    showToast('Movimiento eliminado.')
  }

  function applyBulkChanges(changes: BulkTransactionChanges): void {
    const selectedIds = new Set(ui.txSelectedIds)
    if (selectedIds.size === 0) {
      showToast('Selecciona al menos una fila.')
      return
    }

    const newType = changes.type.trim()
    const newAccountId = changes.accountId.trim()
    const newCategory = changes.category.trim()

    if (!newType && !newAccountId && !newCategory) {
      showToast('Define al menos un cambio de lote.')
      return
    }
    if (newType && !isTransactionType(newType)) {
      showToast('Tipo de movimiento no válido.')
      return
    }

    let updated = 0
    financialStateStore.commitState((draft) => {
      draft.transactions.forEach((item) => {
        if (!selectedIds.has(item.id)) {
          return
        }
        updated += 1
        if (newType && isTransactionType(newType)) {
          item.type = newType
        }
        if (newAccountId) {
          item.accountId = newAccountId
        }
        if (newCategory) {
          item.category = newCategory
        }
      })
    })
    showToast(`Actualizadas ${updated} filas.`)
  }

  function deleteSelected(): void {
    const selectedIds = new Set(ui.txSelectedIds)
    if (selectedIds.size === 0) {
      showToast('Selecciona al menos una fila.')
      return
    }

    const removed = selectedIds.size
    financialStateStore.commitState((draft) => {
      draft.transactions = draft.transactions.filter((item) => !selectedIds.has(item.id))
    })
    ui.txSelectedIds = []
    showToast(`Eliminadas ${removed} filas.`)
  }

  return {
    accounts,
    visibleTransactions,
    breakdown,
    accountFilterOptions,
    typeFilterOptions,
    selectedVisibleCount,
    allVisibleSelected,
    getAccountName,
    orderedCategories,
    setMonth,
    toggleSort,
    toggleFilterPopover,
    closeFilterPopover,
    clearFilterColumn,
    setSelected,
    setAllSelected,
    startEdit,
    cancelEdit,
    addTransaction,
    saveEdit,
    deleteTransaction,
    applyBulkChanges,
    deleteSelected,
  }
})

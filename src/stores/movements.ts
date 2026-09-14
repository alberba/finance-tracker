import { defineStore } from 'pinia'
import { computed } from 'vue'

import { useToast } from '../composables/useToast'
import { getOrderedCategoriesForType } from '../domain/transactions/categories'
import { resolveCategoryId, resolveEntityId, syncListDiff, type CategoryKind } from '../lib/client/command-mapping'
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
  type Subscription,
  type SubscriptionFrequency,
  type TxSortColumn,
} from '../scripts/types'
import { getFirstUpcomingChargeDate, materializeDueSubscriptions } from '../scripts/subscriptions'
import { monthFromISO, parseFloatSafe, round2, todayISO, uid } from '../scripts/utils'
import { useFinancialStateStore } from './financial-state'
import { useUiStore } from './ui'

/**
 * WP7b — maps a legacy `Transaction` row to a `transaction` sync command
 * payload.
 *
 * WP10 fix: `accountId` is a *required* field in `entityCreateSchemas`
 * for `transaction`/`subscription` — the original builder passed the
 * legacy row's `accountId` straight through unresolved (the client-local
 * id, not the server-assigned account UUID `resolveEntityId('account', …)`
 * returns), so every real create command was rejected server-side. Same
 * "required FK, skip until resolved" pattern as `pendingMovement`'s
 * `recurringRuleId` in `stores/recurring.ts`. See that file's identical
 * fix note for the full story of how this went undetected.
 */
async function buildTransactionData(tx: Transaction, currency: string) {
  const accountId = await resolveEntityId('account', tx.accountId)
  if (!accountId) {
    return null
  }
  const categoryId = await resolveCategoryId(tx.type as CategoryKind, tx.category)
  return {
    accountId,
    categoryId,
    type: tx.type,
    date: tx.date,
    description: tx.description,
    amount: tx.amount,
    currency,
  }
}

/** WP7b — maps a legacy `Subscription` row to a `subscription` sync command payload. See the WP10 fix note on `buildTransactionData` above for `accountId`. */
async function buildSubscriptionData(subscription: Subscription, currency: string) {
  const accountId = await resolveEntityId('account', subscription.accountId)
  if (!accountId) {
    return null
  }
  const categoryId = await resolveCategoryId('expense', subscription.category)
  return {
    name: subscription.name,
    categoryId,
    categoryName: subscription.category,
    accountId,
    amount: subscription.amount,
    currency,
    startDate: subscription.startDate,
    nextChargeDate: subscription.nextChargeDate,
    frequency: subscription.frequency,
    isActive: subscription.active,
  }
}

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

export interface NewSubscriptionInput {
  name: string
  amount: number
  accountId: string
  category: string
  frequency: SubscriptionFrequency
  firstChargeDate: string
}

export interface EditedSubscriptionInput {
  name: string
  amount: number
  accountId: string
  category: string
  frequency: SubscriptionFrequency
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
  const subscriptions = computed(() => financialStateStore.subscriptions)
  const categoryEmojis = computed(() => financialStateStore.state.categoryEmojis)

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

    const before = financialStateStore.transactions
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
    void syncListDiff('transaction', before, financialStateStore.transactions, (tx) =>
      buildTransactionData(tx, financialStateStore.currency),
    )
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

    const before = financialStateStore.transactions
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
    void syncListDiff('transaction', before, financialStateStore.transactions, (tx) =>
      buildTransactionData(tx, financialStateStore.currency),
    )

    ui.txEditingId = ''
    ui.investmentTxEditingId = ''
    showToast('Movimiento actualizado.')
    return true
  }

  function deleteTransaction(id: string): void {
    const before = financialStateStore.transactions
    financialStateStore.commitState((draft) => {
      draft.transactions = draft.transactions.filter((item) => item.id !== id)
    })
    void syncListDiff('transaction', before, financialStateStore.transactions, (tx) =>
      buildTransactionData(tx, financialStateStore.currency),
    )
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
    const before = financialStateStore.transactions
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
    void syncListDiff('transaction', before, financialStateStore.transactions, (tx) =>
      buildTransactionData(tx, financialStateStore.currency),
    )
    showToast(`Actualizadas ${updated} filas.`)
  }

  function deleteSelected(): void {
    const selectedIds = new Set(ui.txSelectedIds)
    if (selectedIds.size === 0) {
      showToast('Selecciona al menos una fila.')
      return
    }

    const removed = selectedIds.size
    const before = financialStateStore.transactions
    financialStateStore.commitState((draft) => {
      draft.transactions = draft.transactions.filter((item) => !selectedIds.has(item.id))
    })
    void syncListDiff('transaction', before, financialStateStore.transactions, (tx) =>
      buildTransactionData(tx, financialStateStore.currency),
    )
    ui.txSelectedIds = []
    showToast(`Eliminadas ${removed} filas.`)
  }

  function addSubscription(input: NewSubscriptionInput): boolean {
    const name = input.name.trim()
    if (!name || input.amount <= 0 || !input.accountId || !input.category || !input.firstChargeDate) {
      showToast('Completa nombre, cuenta, categoría, fecha e importe válido.')
      return false
    }

    let generatedCount = 0
    const beforeSubscriptions = financialStateStore.subscriptions
    const beforeTransactions = financialStateStore.transactions
    financialStateStore.commitState((draft) => {
      const subscription: Subscription = {
        id: uid('subscription'),
        name,
        amount: round2(input.amount),
        accountId: input.accountId,
        category: input.category,
        frequency: input.frequency,
        startDate: input.firstChargeDate,
        nextChargeDate: input.firstChargeDate,
        active: true,
      }
      subscription.nextChargeDate = getFirstUpcomingChargeDate(subscription, todayISO())
      draft.subscriptions.push(subscription)
      generatedCount = materializeDueSubscriptions(draft, todayISO()).generatedCount
    })
    void syncListDiff('subscription', beforeSubscriptions, financialStateStore.subscriptions, (subscription) =>
      buildSubscriptionData(subscription, financialStateStore.currency),
    )
    // `materializeDueSubscriptions` may also push already-due charges as
    // ordinary transactions in the same commit — diff those too.
    void syncListDiff('transaction', beforeTransactions, financialStateStore.transactions, (tx) =>
      buildTransactionData(tx, financialStateStore.currency),
    )
    showToast(
      generatedCount > 0
        ? `Suscripción guardada y ${generatedCount} gasto generado.`
        : 'Suscripción guardada.',
    )
    return true
  }

  function updateSubscription(id: string, input: EditedSubscriptionInput): boolean {
    const name = input.name.trim()
    if (!name || input.amount <= 0 || !input.accountId || !input.category) {
      showToast('Completa nombre, cuenta, categoría e importe válido.')
      return false
    }

    const before = financialStateStore.subscriptions
    financialStateStore.commitState((draft) => {
      const subscription = draft.subscriptions.find((item) => item.id === id)
      if (!subscription) {
        return
      }
      subscription.name = name
      subscription.amount = round2(input.amount)
      subscription.accountId = input.accountId
      subscription.category = input.category
      subscription.frequency = input.frequency
    })
    void syncListDiff('subscription', before, financialStateStore.subscriptions, (subscription) =>
      buildSubscriptionData(subscription, financialStateStore.currency),
    )
    showToast('Suscripción actualizada.')
    return true
  }

  function setSubscriptionActive(id: string, active: boolean): void {
    const before = financialStateStore.subscriptions
    financialStateStore.commitState((draft) => {
      const subscription = draft.subscriptions.find((item) => item.id === id)
      if (subscription) {
        if (active && !subscription.active) {
          subscription.nextChargeDate = getFirstUpcomingChargeDate(subscription, todayISO())
        }
        subscription.active = active
      }
    })
    void syncListDiff('subscription', before, financialStateStore.subscriptions, (subscription) =>
      buildSubscriptionData(subscription, financialStateStore.currency),
    )
    showToast(active ? 'Suscripción reactivada.' : 'Suscripción pausada.')
  }

  function deleteSubscription(id: string): void {
    const before = financialStateStore.subscriptions
    financialStateStore.commitState((draft) => {
      draft.subscriptions = draft.subscriptions.filter((item) => item.id !== id)
    })
    void syncListDiff('subscription', before, financialStateStore.subscriptions, (subscription) =>
      buildSubscriptionData(subscription, financialStateStore.currency),
    )
    showToast('Suscripción eliminada. Sus gastos ya creados se conservan.')
  }

  return {
    accounts,
    subscriptions,
    categoryEmojis,
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
    addSubscription,
    updateSubscription,
    setSubscriptionActive,
    deleteSubscription,
  }
})

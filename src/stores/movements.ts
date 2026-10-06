import { defineStore } from 'pinia'

import { computed, watch } from 'vue'

import { useToast } from '../composables/useToast'
import { getOrderedCategoriesForType } from '../domain/transactions/categories'
import { resolveCategoryId, resolveEntityId, syncListDiff } from '../lib/client/command-mapping'
import { syncMovements } from '../lib/client/movement-commands'
import {
  buildMonthGroups,
  categoryBreakdown,
  monthTotals,
  registryYears,
  signedAmount,
} from '../domain/transactions/registry'
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

/** Maps a subscription, skipping commands whose required account is unresolved. */
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
  /** The month it counts in; defaults to the month of the date. */
  month?: number
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

function currentYear(): number {
  return Number(todayISO().slice(0, 4))
}

function todayMonth(): number {
  return monthFromISO(todayISO()) ?? 0
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

  const years = computed(() => registryYears(financialStateStore.transactions, currentYear()))

  /** The selected year's movements under the toolbar filters, by month. */
  const monthGroups = computed(() =>
    buildMonthGroups(financialStateStore.transactions, ui.txYear, ui.txFilters, ui.txSort),
  )

  const visibleTransactions = computed(() => monthGroups.value.flatMap((group) => group.rows))

  /** Movements of the selected year, whatever the filters (the tab's count). */
  const yearCount = computed(() =>
    buildMonthGroups(
      financialStateStore.transactions,
      ui.txYear,
      { search: '', types: [], accountIds: [], date: '', amountMin: '', amountMax: '' },
      ui.txSort,
    ).reduce((sum, group) => sum + group.count, 0),
  )

  /** Totals of the month the ink band shows. */
  const bandTotals = computed(() =>
    monthTotals(financialStateStore.transactions, ui.txYear, ui.txFilterMonth),
  )

  /** True while the band shows the current month, so it cannot move forward. */
  const isLatestMonth = computed(
    () =>
      ui.txYear > currentYear() ||
      (ui.txYear === currentYear() && ui.txFilterMonth >= todayMonth()),
  )

  const selectedTransactions = computed(() => {
    const selected = new Set(ui.txSelectedIds)
    return financialStateStore.transactions.filter((item) => selected.has(item.id))
  })
  const selectedVisibleCount = computed(
    () => visibleTransactions.value.filter((item) => ui.txSelectedIds.includes(item.id)).length,
  )
  const selectedSum = computed(() =>
    round2(selectedTransactions.value.reduce((sum, item) => sum + signedAmount(item), 0)),
  )
  const allVisibleSelected = computed(
    () =>
      visibleTransactions.value.length > 0 &&
      selectedVisibleCount.value === visibleTransactions.value.length,
  )

  // A selection only covers rows the user can see: changing the year or a
  // filter drops it, so a bulk delete never reaches hidden movements.
  watch(
    () => [ui.txYear, JSON.stringify(ui.txFilters)],
    () => {
      ui.txSelectedIds = []
    },
  )

  function breakdownFor(type: TransactionType) {
    return categoryBreakdown(financialStateStore.transactions, ui.txYear, ui.txFilterMonth, type)
  }

  function orderedCategories(type: BudgetType): string[] {
    return getOrderedCategoriesForType(financialStateStore.state, type)
  }

  function setMonth(month: number): void {
    ui.txFilterMonth = month
  }

  /** Moves the band one month back or forward, across the turn of the year. */
  function stepMonth(delta: -1 | 1): void {
    const index = ui.txYear * 12 + ui.txFilterMonth + delta
    const year = Math.floor(index / 12)
    if (year !== ui.txYear) setYear(year)
    ui.txFilterMonth = index - year * 12
  }

  /** Shows another year, starting at its latest month with movements. */
  function setYear(year: number): void {
    ui.txYear = year
    ui.txSelectedIds = []
    if (year === currentYear()) {
      ui.txFilterMonth = todayMonth()
      return
    }
    const months = buildMonthGroups(
      financialStateStore.transactions,
      year,
      { search: '', types: [], accountIds: [], date: '', amountMin: '', amountMax: '' },
      ui.txSort,
    ).map((group) => group.month)
    ui.txFilterMonth = months[0] ?? 11
  }

  function toggleSort(column: TxSortColumn): void {
    if (ui.txSort.column === column) {
      ui.txSort.direction = ui.txSort.direction === 'asc' ? 'desc' : 'asc'
    } else {
      ui.txSort.column = column
      ui.txSort.direction = 'desc'
    }
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

  function clearSelection(): void {
    ui.txSelectedIds = []
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
    void syncMovements(before, financialStateStore.transactions, financialStateStore.currency)
    return true
  }

  function saveEdit(id: string, fields: EditedTransactionInput): boolean {
    if (financialStateStore.transactions.find((tx) => tx.id === id)?.remoteOperation) return false
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
      tx.month = fields.month ?? monthFromISO(date) ?? tx.month
      tx.accountId = accountId
      tx.type = type
      tx.category = category
      tx.description = description
      tx.amount = round2(amount)
    })
    void syncMovements(before, financialStateStore.transactions, financialStateStore.currency)

    ui.investmentTxEditingId = ''
    showToast('Movimiento actualizado.')
    return true
  }

  function deleteTransaction(id: string): void {
    if (financialStateStore.transactions.find((tx) => tx.id === id)?.remoteOperation) return
    const before = financialStateStore.transactions
    financialStateStore.commitState((draft) => {
      draft.transactions = draft.transactions.filter((item) => item.id !== id)
    })
    void syncMovements(before, financialStateStore.transactions, financialStateStore.currency)
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
        if (item.remoteOperation || !selectedIds.has(item.id)) {
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
    void syncMovements(before, financialStateStore.transactions, financialStateStore.currency)
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
      draft.transactions = draft.transactions.filter(
        (item) => item.remoteOperation || !selectedIds.has(item.id),
      )
    })
    void syncMovements(before, financialStateStore.transactions, financialStateStore.currency)
    ui.txSelectedIds = []
    showToast(`Eliminadas ${removed} filas.`)
  }

  async function refreshSubscriptions(recoveredIds: readonly string[] = []): Promise<void> {
    const beforeTransactions = financialStateStore.transactions
    // Recovered dates must be saved even when their first charge is still in the future.
    const beforeSubscriptions = financialStateStore.subscriptions.map((subscription) =>
      recoveredIds.includes(subscription.id)
        ? { ...subscription, startDate: '', nextChargeDate: '' }
        : subscription,
    )
    financialStateStore.commitState((draft) => {
      materializeDueSubscriptions(draft, todayISO())
    })
    await syncMovements(
      beforeTransactions,
      financialStateStore.transactions,
      financialStateStore.currency,
    )
    await syncListDiff(
      'subscription',
      beforeSubscriptions,
      financialStateStore.subscriptions,
      (subscription) => buildSubscriptionData(subscription, financialStateStore.currency),
    )
  }

  function addSubscription(input: NewSubscriptionInput): boolean {
    const name = input.name.trim()
    if (
      !name ||
      input.amount <= 0 ||
      !input.accountId ||
      !input.category ||
      !input.firstChargeDate
    ) {
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
    void syncListDiff(
      'subscription',
      beforeSubscriptions,
      financialStateStore.subscriptions,
      (subscription) => buildSubscriptionData(subscription, financialStateStore.currency),
    )
    // `materializeDueSubscriptions` may also push already-due charges as
    // ordinary transactions in the same commit — diff those too.
    void syncMovements(
      beforeTransactions,
      financialStateStore.transactions,
      financialStateStore.currency,
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
    years,
    monthGroups,
    visibleTransactions,
    yearCount,
    bandTotals,
    isLatestMonth,
    selectedTransactions,
    selectedVisibleCount,
    selectedSum,
    allVisibleSelected,
    breakdownFor,
    getAccountName,
    orderedCategories,
    setMonth,
    stepMonth,
    setYear,
    toggleSort,
    setSelected,
    setAllSelected,
    clearSelection,
    addTransaction,
    saveEdit,
    deleteTransaction,
    applyBulkChanges,
    deleteSelected,
    refreshSubscriptions,
    addSubscription,
    updateSubscription,
    setSubscriptionActive,
    deleteSubscription,
  }
})

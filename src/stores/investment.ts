import { defineStore } from 'pinia'
import { computed } from 'vue'

import { useToast } from '../composables/useToast'
import {
  isBitvavoBrokerAccount as isBitvavoBroker,
  resolveInvestmentCategory as resolveCategory,
} from '../domain/investment/calculations'
import {
  applyContributionSave,
  buildContributionMetricRows,
  buildWorkflowSnapshotState,
  computeWorkflowWarnings,
  isManualContributionDate,
  removeManualContribution,
  upsertContributionFlow,
  type AllocationInputValue,
  type ContributionSaveResult,
  type SnapshotInputValue,
} from '../domain/investment/contributions'
import {
  buildInvestmentDashboardViewModel,
  buildInvestmentMovementRows,
  groupInvestmentMovementsByMonth,
  summarizeInvestmentYear,
  buildInvestmentYearOptions,
  type ReturnMode,
  buildContributionLedger,
  summarizeContributions,
} from '../domain/investment/view-model'
import {
  computeInvestmentMovement,
  normalizeInvestmentSide,
  normalizeInvestmentSymbol,
} from '../scripts/investment-movements'
import { symbolsMatchInstrument } from '../domain/investment/symbol-matching'
import {
  resolveCategoryId,
  resolveEntityId,
  syncListDiff,
  type CategoryKind,
} from '../lib/client/command-mapping'
import type { Contribution, InvestmentSubTab, Transaction } from '../scripts/types'
import { monthFromISO, round2, todayISO, uid } from '../scripts/utils'
import { useFinancialStateStore } from './financial-state'
import { useStockEventsStore } from './stockevents'
import { useUiStore } from './ui'

/** WP7b — maps a legacy investment `Transaction` row to a `transaction` sync command payload. */
export async function buildInvestmentTransactionData(tx: Transaction, currency: string) {
  // The server only knows its own account ids; sending the local one made
  // every investment movement fail the ownership check (audit §1).
  const accountId = await resolveEntityId('account', tx.accountId)
  if (!accountId) return null
  const categoryId = await resolveCategoryId(tx.type as CategoryKind, tx.category)
  return {
    accountId,
    categoryId,
    type: tx.type,
    date: tx.date,
    description: tx.description,
    amount: tx.amount,
    currency: tx.movementCurrency || currency,
    time: tx.time ?? null,
    declared: Boolean(tx.declared),
    // The operation travels nested, so importe and operación reach D1 in the
    // same write and cannot end up disagreeing (ADR 0002).
    operation: buildOperationData(tx),
  }
}

/**
 * The operation of an investment movement, or `null` when the movement has
 * none — which is also how the server is told to drop the one it had stored.
 */
function buildOperationData(tx: Transaction) {
  if (tx.type !== 'investment' || !tx.side) return null
  return {
    symbol: tx.symbol ?? null,
    side: tx.side,
    units: Number(tx.units) || 0,
    unitPrice: Number(tx.unitPrice) || 0,
    fee: Number(tx.fee) || 0,
  }
}

/** WP7b — maps a legacy `Contribution` row to a `contribution` sync command payload. */
function buildContributionData(contribution: Contribution, currency: string) {
  return {
    date: contribution.date,
    amount: contribution.amount,
    currency,
    portfolioDate: contribution.portfolioDate,
    portfolioValue: contribution.portfolioValue,
    flow: contribution.flow,
  }
}

/** Resolves a contribution's flow allocations to server `account` ids for its sync command. */
async function buildContributionAllocations(contribution: Contribution) {
  const allocations: Array<{ accountId: string; amount: number }> = []
  for (const allocation of contribution.flowAllocations || []) {
    const accountId = await resolveEntityId('account', allocation.accountId)
    if (!accountId) {
      console.warn(
        `[sync-v2] No se pudo incluir el reparto a la cuenta local "${allocation.accountId}" en el aporte: todavía no se ha sincronizado con el servidor.`,
      )
      continue
    }
    allocations.push({ accountId, amount: allocation.amount })
  }
  return allocations
}

export interface NewInvestmentMovementInput {
  date: string
  time: string
  side: string
  symbol: string
  category: string
  unitPrice: string
  units: string
  fee: string
  movementCurrency: string
  accountId: string
  declared: boolean
  toCash?: boolean
}

export interface SaveContributionOptions {
  syncStockEventsCash?: boolean
}

export const useInvestmentStore = defineStore('investment', () => {
  const financialStateStore = useFinancialStateStore()
  const stockEventsStore = useStockEventsStore()
  const uiStore = useUiStore()
  const { showToast } = useToast()
  const ui = uiStore.ui

  const accounts = computed(() => financialStateStore.accounts)
  const investmentCategories = computed(() => financialStateStore.state.investmentCategories)

  function getAccountName(accountId: string): string {
    const account = financialStateStore.accounts.find((item) => item.id === accountId)
    return account ? account.name : accountId || '-'
  }

  function findUniqueInstrumentId(symbol: string): string | undefined {
    const matches = financialStateStore.state.instruments.filter((instrument) =>
      symbolsMatchInstrument(symbol, instrument),
    )
    return matches.length === 1 ? matches[0].id : undefined
  }

  function isBitvavoBrokerAccount(accountId: string): boolean {
    return isBitvavoBroker(financialStateStore.state, accountId)
  }

  function resolveInvestmentCategory(
    accountId: string,
    rawCategory: string,
    fallback: string,
  ): string {
    return resolveCategory(financialStateStore.state, accountId, rawCategory, fallback)
  }

  const dashboardViewModel = computed(() =>
    buildInvestmentDashboardViewModel(
      financialStateStore.state,
      ui.investmentMonth,
      ui.investmentReturnMode as ReturnMode,
    ),
  )

  const yearOptions = computed(() => buildInvestmentYearOptions(financialStateStore.state))

  const movementRows = computed(() =>
    buildInvestmentMovementRows(
      financialStateStore.state,
      ui.investmentYearFilter,
      ui.investmentOnlyUndeclared,
      getAccountName,
    ),
  )

  const movementMonthGroups = computed(() => groupInvestmentMovementsByMonth(movementRows.value))

  const yearSummary = computed(() =>
    summarizeInvestmentYear(financialStateStore.state, ui.investmentYearFilter),
  )

  const contributionRows = computed(() => buildContributionMetricRows(financialStateStore.state))

  const contributionLedger = computed(() =>
    buildContributionLedger(contributionRows.value, (date) =>
      isManualContributionDate(financialStateStore.state, date),
    ),
  )

  const contributionSummary = computed(() =>
    summarizeContributions(contributionRows.value, financialStateStore.state.year),
  )

  function setTab(tab: InvestmentSubTab): void {
    ui.investmentTab = tab
  }

  function setReturnMode(mode: ReturnMode): void {
    ui.investmentReturnMode = mode
  }

  function setMonth(month: number): void {
    ui.investmentMonth = month
  }

  function setYearFilter(year: number): void {
    ui.investmentYearFilter = year
    ui.investmentTxEditingId = ''
  }

  function setOnlyUndeclared(value: boolean): void {
    ui.investmentOnlyUndeclared = value
    ui.investmentTxEditingId = ''
  }

  function addMovement(input: NewInvestmentMovementInput): boolean {
    const side = normalizeInvestmentSide(input.side)
    const symbol = normalizeInvestmentSymbol(input.symbol)
    const date = input.date.trim() || todayISO()
    const accountId = input.accountId.trim()
    const time = input.time.trim()
    const movementCurrency = String(input.movementCurrency || financialStateStore.currency || 'EUR')
      .trim()
      .toUpperCase()
      .slice(0, 3)

    if (!accountId || !symbol || !time) {
      showToast('Completa broker, hora y símbolo.')
      return false
    }

    const computed = computeInvestmentMovement({
      side,
      symbol,
      units: Number(input.units) || 0,
      unitPrice: Number(input.unitPrice) || 0,
      fee: Number(input.fee) || 0,
    })
    if (
      computed.normalizedUnits <= 0 ||
      computed.normalizedUnitPrice <= 0 ||
      computed.signedAmount === 0
    ) {
      showToast('Precio, títulos y gasto deben ser válidos.')
      return false
    }

    const category = resolveInvestmentCategory(
      accountId,
      input.category.trim(),
      computed.normalizedSymbol,
    )
    const instrumentId = findUniqueInstrumentId(computed.normalizedSymbol)

    const transaction: Transaction = {
      id: uid('tx'),
      date,
      month: monthFromISO(date) ?? ui.investmentMonth,
      type: 'investment',
      accountId,
      category,
      description: computed.description,
      amount: computed.signedAmount,
      time,
      symbol: computed.normalizedSymbol,
      ...(instrumentId ? { instrumentId } : {}),
      side,
      unitPrice: computed.normalizedUnitPrice,
      units: computed.normalizedUnits,
      fee: computed.normalizedFee,
      movementCurrency,
      declared: input.declared,
      createdAt: new Date().toISOString(),
    }
    const before = financialStateStore.transactions
    financialStateStore.commitState((draft) => {
      draft.transactions.push(transaction)
    })
    void syncListDiff('transaction', before, financialStateStore.transactions, (tx) =>
      buildInvestmentTransactionData(tx, financialStateStore.currency),
    )
    showToast('Movimiento de inversión guardado.')
    void stockEventsStore.syncMovement(transaction, { toCash: input.toCash })
    return true
  }

  function saveEditedMovement(id: string, input: NewInvestmentMovementInput): boolean {
    const side = normalizeInvestmentSide(input.side)
    const symbol = normalizeInvestmentSymbol(input.symbol)
    const date = input.date.trim()
    const time = input.time.trim()
    const accountId = input.accountId.trim()
    const movementCurrency = String(input.movementCurrency || financialStateStore.currency || 'EUR')
      .trim()
      .toUpperCase()
      .slice(0, 3)

    if (!date || !time || !symbol || !accountId) {
      showToast('Completa fecha, hora, símbolo y broker.')
      return false
    }

    const computed = computeInvestmentMovement({
      side,
      symbol,
      units: Number(input.units) || 0,
      unitPrice: Number(input.unitPrice) || 0,
      fee: Number(input.fee) || 0,
    })
    if (
      computed.normalizedUnits <= 0 ||
      computed.normalizedUnitPrice <= 0 ||
      computed.signedAmount === 0
    ) {
      showToast('Precio, títulos y gasto deben ser válidos.')
      return false
    }

    const category = resolveInvestmentCategory(
      accountId,
      input.category.trim(),
      computed.normalizedSymbol,
    )

    const before = financialStateStore.transactions
    financialStateStore.commitState((draft) => {
      const tx = draft.transactions.find(
        (item): item is Transaction => item.id === id && item.type === 'investment',
      )
      if (!tx) {
        return
      }
      tx.date = date
      tx.month = monthFromISO(date) ?? tx.month
      tx.time = time
      tx.accountId = accountId
      tx.side = side
      tx.symbol = computed.normalizedSymbol
      const instrumentId = findUniqueInstrumentId(computed.normalizedSymbol)
      if (instrumentId) tx.instrumentId = instrumentId
      else delete tx.instrumentId
      tx.category = category
      tx.unitPrice = computed.normalizedUnitPrice
      tx.units = computed.normalizedUnits
      tx.fee = computed.normalizedFee
      tx.movementCurrency = movementCurrency
      tx.description = computed.description
      tx.amount = computed.signedAmount
      tx.declared = input.declared
    })
    void syncListDiff('transaction', before, financialStateStore.transactions, (tx) =>
      buildInvestmentTransactionData(tx, financialStateStore.currency),
    )
    ui.investmentTxEditingId = ''
    showToast('Movimiento de inversión actualizado.')
    // Editing a movement that already exists in Stock Events cannot update the
    // remote row (the API only creates), so the edit is re-sent to keep the
    // remote side consistent with what the user just saved.
    const updated = financialStateStore.transactions.find(
      (item): item is Transaction => item.id === id && item.type === 'investment',
    )
    if (updated) {
      void stockEventsStore.syncMovement(updated)
    }
    return true
  }

  /**
   * Manual resend of one movement to Stock Events, for the case the automatic
   * fire-and-forget sync skipped it (no mapping then, mapping now).
   */
  async function resyncMovement(transactionId: string): Promise<boolean> {
    const tx = financialStateStore.transactions.find(
      (item): item is Transaction => item.id === transactionId && item.type === 'investment',
    )
    if (!tx) {
      showToast('Movimiento no encontrado.')
      return false
    }
    const result = await stockEventsStore.syncMovement(tx)
    if (result === 'skipped' && !stockEventsStore.isConnected) {
      showToast('Activa la conexión con Stock Events para reenviar.')
    }
    return result === 'synced'
  }

  function deleteMovement(id: string): void {
    const before = financialStateStore.transactions
    financialStateStore.commitState((draft) => {
      draft.transactions = draft.transactions.filter((item) => item.id !== id)
    })
    void syncListDiff('transaction', before, financialStateStore.transactions, (tx) =>
      buildInvestmentTransactionData(tx, financialStateStore.currency),
    )
    ui.investmentTxEditingId = ''
    showToast('Movimiento eliminado.')
  }

  function toggleDeclared(id: string): void {
    let nowDeclared = false
    const before = financialStateStore.transactions
    financialStateStore.commitState((draft) => {
      const tx = draft.transactions.find((item) => item.id === id && item.type === 'investment')
      if (!tx) {
        return
      }
      tx.declared = !tx.declared
      nowDeclared = Boolean(tx.declared)
    })
    void syncListDiff('transaction', before, financialStateStore.transactions, (tx) =>
      buildInvestmentTransactionData(tx, financialStateStore.currency),
    )
    showToast(
      nowDeclared ? 'Movimiento marcado como declarado.' : 'Movimiento marcado como no declarado.',
    )
  }

  function setContributionFlow(date: string, flow: number): void {
    const before = financialStateStore.contributions
    financialStateStore.commitState((draft) => {
      upsertContributionFlow(draft, date, round2(flow))
    })
    void syncListDiff('contribution', before, financialStateStore.contributions, (contribution) =>
      buildContributionData(contribution, financialStateStore.currency),
    )
  }

  function isManualDate(date: string): boolean {
    return isManualContributionDate(financialStateStore.state, date)
  }

  function deleteContribution(date: string): void {
    if (!isManualDate(date)) {
      return
    }
    const before = financialStateStore.contributions
    financialStateStore.commitState((draft) => {
      removeManualContribution(draft, date)
    })
    void syncListDiff('contribution', before, financialStateStore.contributions, (contribution) =>
      buildContributionData(contribution, financialStateStore.currency),
    )
    showToast('Aporte manual eliminado.')
  }

  function buildWorkflowState(month: number, date: string) {
    return buildWorkflowSnapshotState(financialStateStore.state, month, date)
  }

  function workflowWarnings(
    snapshotInputs: SnapshotInputValue[],
    allocations: AllocationInputValue[],
    total: number,
    formatMoney: (value: number) => string,
  ): string[] {
    return computeWorkflowWarnings(
      financialStateStore.state,
      snapshotInputs,
      allocations,
      total,
      formatMoney,
    )
  }

  function saveContribution(
    date: string,
    month: number,
    snapshotInputs: SnapshotInputValue[],
    allocations: AllocationInputValue[],
    warnings: string[],
    options: SaveContributionOptions = {},
  ): boolean {
    const before = financialStateStore.contributions
    let result: ContributionSaveResult = { ok: false, hadWarnings: false }
    financialStateStore.commitState((draft) => {
      result = applyContributionSave(draft, { date, month, snapshotInputs, allocations, warnings })
      // applyContributionSave is pure (see contributions.ts) and returns the
      // updated state instead of mutating `draft` directly; fold it onto the
      // store's disposable draft here so `commitState` still observes the change.
      if (result.ok && result.state) {
        Object.assign(draft, result.state)
      }
    })
    if (!result.ok) {
      if (result.error) {
        showToast(result.error)
      }
      return false
    }
    const currency = financialStateStore.currency
    void syncListDiff('contribution', before, financialStateStore.contributions, async (contribution) => ({
      ...buildContributionData(contribution, currency),
      allocations: await buildContributionAllocations(contribution),
    }))
    showToast(result.hadWarnings ? 'Aporte guardado con avisos.' : 'Aporte guardado.')
    if (options.syncStockEventsCash) {
      void stockEventsStore.syncContributionCash(date, allocations)
    }
    return true
  }

  return {
    accounts,
    investmentCategories,
    dashboardViewModel,
    yearOptions,
    movementRows,
    movementMonthGroups,
    yearSummary,
    contributionRows,
    contributionLedger,
    contributionSummary,
    getAccountName,
    isBitvavoBrokerAccount,
    resolveInvestmentCategory,
    setTab,
    setReturnMode,
    setMonth,
    setYearFilter,
    setOnlyUndeclared,
    addMovement,
    saveEditedMovement,
    resyncMovement,
    deleteMovement,
    toggleDeclared,
    setContributionFlow,
    isManualDate,
    deleteContribution,
    buildWorkflowState,
    workflowWarnings,
    saveContribution,
  }
})

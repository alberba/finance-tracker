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
  buildInvestmentYearOptions,
  type ReturnMode,
} from '../domain/investment/view-model'
import {
  computeInvestmentMovement,
  normalizeInvestmentSide,
  normalizeInvestmentSymbol,
} from '../scripts/investment-movements'
import { symbolsMatchInstrument } from '../domain/investment/symbol-matching'
import type { InvestmentSubTab, Transaction } from '../scripts/types'
import { monthFromISO, round2, todayISO, uid } from '../scripts/utils'
import { useFinancialStateStore } from './financial-state'
import { useStockEventsStore } from './stockevents'
import { useUiStore } from './ui'

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
    const matches = financialStateStore.state.instruments.filter(
      (instrument) => symbolsMatchInstrument(symbol, instrument),
    )
    return matches.length === 1 ? matches[0].id : undefined
  }

  function isBitvavoBrokerAccount(accountId: string): boolean {
    return isBitvavoBroker(financialStateStore.state, accountId)
  }

  function resolveInvestmentCategory(accountId: string, rawCategory: string, fallback: string): string {
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

  const contributionRows = computed(() => buildContributionMetricRows(financialStateStore.state))

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

  function startEditMovement(id: string): void {
    ui.investmentTxEditingId = id
  }

  function cancelEditMovement(): void {
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

    const category = resolveInvestmentCategory(accountId, input.category.trim(), computed.normalizedSymbol)
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
    financialStateStore.commitState((draft) => {
      draft.transactions.push(transaction)
    })
    showToast('Movimiento de inversión guardado.')
    void stockEventsStore.syncMovement(transaction)
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

    const category = resolveInvestmentCategory(accountId, input.category.trim(), computed.normalizedSymbol)

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
    ui.investmentTxEditingId = ''
    showToast('Movimiento de inversión actualizado.')
    return true
  }

  function deleteMovement(id: string): void {
    financialStateStore.commitState((draft) => {
      draft.transactions = draft.transactions.filter((item) => item.id !== id)
    })
    ui.investmentTxEditingId = ''
    showToast('Movimiento eliminado.')
  }

  function toggleDeclared(id: string): void {
    let nowDeclared = false
    financialStateStore.commitState((draft) => {
      const tx = draft.transactions.find((item) => item.id === id && item.type === 'investment')
      if (!tx) {
        return
      }
      tx.declared = !tx.declared
      nowDeclared = Boolean(tx.declared)
    })
    showToast(
      nowDeclared ? 'Movimiento marcado como declarado.' : 'Movimiento marcado como no declarado.',
    )
  }

  function setContributionFlow(date: string, flow: number): void {
    financialStateStore.commitState((draft) => {
      upsertContributionFlow(draft, date, round2(flow))
    })
  }

  function isManualDate(date: string): boolean {
    return isManualContributionDate(financialStateStore.state, date)
  }

  function deleteContribution(date: string): void {
    if (!isManualDate(date)) {
      return
    }
    financialStateStore.commitState((draft) => {
      removeManualContribution(draft, date)
    })
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
  ): boolean {
    let result: ContributionSaveResult = { ok: false, hadWarnings: false }
    financialStateStore.commitState((draft) => {
      result = applyContributionSave(draft, { date, month, snapshotInputs, allocations, warnings })
    })
    if (!result.ok) {
      if (result.error) {
        showToast(result.error)
      }
      return false
    }
    showToast(result.hadWarnings ? 'Aporte guardado con avisos.' : 'Aporte guardado.')
    return true
  }

  return {
    accounts,
    investmentCategories,
    dashboardViewModel,
    yearOptions,
    movementRows,
    contributionRows,
    getAccountName,
    isBitvavoBrokerAccount,
    resolveInvestmentCategory,
    setTab,
    setReturnMode,
    setMonth,
    setYearFilter,
    setOnlyUndeclared,
    startEditMovement,
    cancelEditMovement,
    addMovement,
    saveEditedMovement,
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

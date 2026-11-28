import type { Month } from '../lib/month'
import { defineStore } from 'pinia'

import { computed } from 'vue'

import { useToast } from '../composables/useToast'
import {
  isBitvavoBrokerAccount as isBitvavoBroker,
  resolveInvestmentCategory as resolveCategory,
} from '../domain/investment/calculations'
import { buildInvestmentDashboardViewModel, type ReturnMode } from '../domain/investment/view-model'
import {
  computeInvestmentMovement,
  normalizeInvestmentSide,
  normalizeInvestmentSymbol,
} from '../scripts/investment-movements'
import { symbolsMatchInstrument } from '../domain/investment/symbol-matching'
import { syncMovements } from '../lib/client/movement-commands'
import type { Transaction } from '../scripts/types'
import { monthFromISO, todayISO, uid } from '../scripts/utils'
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
  /** The investment account the instrument lands in; defaults to the one of its instrument. */
  destinationAccountId?: string
  declared: boolean
  toCash?: boolean
}

export const useInvestmentStore = defineStore('investment', () => {
  const financialStateStore = useFinancialStateStore()
  const stockEventsStore = useStockEventsStore()
  const uiStore = useUiStore()
  const { showToast } = useToast()
  const ui = uiStore.ui

  const accounts = computed(() => financialStateStore.accounts)
  const investmentCategories = computed(() => financialStateStore.state.investmentCategories)

  /** The instrument a symbol names; with several, the one in the destination account. */
  function findInstrumentId(symbol: string, destinationAccountId?: string): string | undefined {
    const matches = financialStateStore.state.instruments.filter((instrument) =>
      symbolsMatchInstrument(symbol, instrument),
    )
    if (matches.length === 1) return matches[0].id
    const inDestination = matches.filter(
      (instrument) => instrument.investmentAssetId === destinationAccountId,
    )
    return inDestination.length === 1 ? inDestination[0].id : undefined
  }

  /** The investment account a symbol belongs to by default: the one of its instrument. */
  function defaultInvestmentAccountId(symbol: string): string | undefined {
    const instrumentId = findInstrumentId(normalizeInvestmentSymbol(symbol))
    return financialStateStore.state.instruments.find(
      (instrument) => instrument.id === instrumentId,
    )?.investmentAssetId
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
      // The cover reads up to today: positions are worth their instruments' quotes.
      { quotes: true },
    ),
  )

  function setReturnMode(mode: ReturnMode): void {
    ui.investmentReturnMode = mode
  }

  function setMonth(month: Month): void {
    ui.investmentMonth = month
  }

  /** The chosen investment account when it exists, otherwise the one of the symbol's instrument. */
  function resolveDestination(chosen: string | undefined, symbol: string): string | undefined {
    const known = (id: string | undefined) =>
      financialStateStore.activeInvestmentAssets.some((asset) => asset.id === id) ? id : undefined
    return known(chosen?.trim()) ?? known(defaultInvestmentAccountId(symbol))
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
    const destinationAccountId = resolveDestination(
      input.destinationAccountId,
      computed.normalizedSymbol,
    )
    const instrumentId = findInstrumentId(computed.normalizedSymbol, destinationAccountId)

    const transaction: Transaction = {
      id: uid('tx'),
      date,
      month: monthFromISO(date) ?? ui.investmentMonth,
      type: 'investment',
      accountId,
      ...(destinationAccountId ? { destinationAccountId } : {}),
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
    void syncMovements(before, financialStateStore.transactions, financialStateStore.currency)
    showToast('Movimiento de inversión guardado.')
    void stockEventsStore.syncMovement(transaction, { toCash: input.toCash })
    return true
  }

  return {
    accounts,
    investmentCategories,
    dashboardViewModel,
    isBitvavoBrokerAccount,
    resolveInvestmentCategory,
    defaultInvestmentAccountId,
    setReturnMode,
    setMonth,
    addMovement,
  }
})

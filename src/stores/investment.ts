import type { Month } from '../lib/month'
import { defineStore } from 'pinia'

import { computed } from 'vue'

import { useToast } from '../composables/useToast'
import {
  isBitvavoBrokerAccount as isBitvavoBroker,
  resolveInvestmentCategory as resolveCategory,
} from '../domain/investment/calculations'
import {
  applyContributionSave,
  type AllocationInputValue,
  type ContributionSaveResult,
  type SnapshotInputValue,
} from '../domain/investment/contributions'
import { buildInvestmentDashboardViewModel, type ReturnMode } from '../domain/investment/view-model'
import {
  computeInvestmentMovement,
  normalizeInvestmentSide,
  normalizeInvestmentSymbol,
} from '../scripts/investment-movements'
import { symbolsMatchInstrument } from '../domain/investment/symbol-matching'
import { resolveEntityId, syncListDiff } from '../lib/client/command-mapping'
import { syncMovements } from '../lib/client/movement-commands'
import { syncSnapshotBalances } from '../lib/client/wealth-snapshot'
import type { Contribution, Transaction } from '../scripts/types'
import { monthFromISO, todayISO, uid } from '../scripts/utils'
import { useFinancialStateStore } from './financial-state'
import { useStockEventsStore } from './stockevents'
import { useUiStore } from './ui'

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

  function setReturnMode(mode: ReturnMode): void {
    ui.investmentReturnMode = mode
  }

  function setMonth(month: Month): void {
    ui.investmentMonth = month
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
    void syncMovements(before, financialStateStore.transactions, financialStateStore.currency)
    showToast('Movimiento de inversión guardado.')
    void stockEventsStore.syncMovement(transaction, { toCash: input.toCash })
    return true
  }

  /** Marks several movements as declared in one step: one save, one sync, one toast. */
  function markDeclared(ids: readonly string[]): void {
    const wanted = new Set(ids)
    const before = financialStateStore.transactions
    financialStateStore.commitState((draft) => {
      for (const tx of draft.transactions) {
        if (tx.type === 'investment' && wanted.has(tx.id)) tx.declared = true
      }
    })
    void syncMovements(before, financialStateStore.transactions, financialStateStore.currency)
    showToast('Movimientos marcados como declarados.')
  }

  function saveContribution(
    date: string,
    month: Month,
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
    void syncListDiff(
      'contribution',
      before,
      financialStateStore.contributions,
      async (contribution) => ({
        ...buildContributionData(contribution, currency),
        allocations: await buildContributionAllocations(contribution),
      }),
    )
    void syncSnapshotBalances(
      financialStateStore.year,
      financialStateStore.state.snapshots[String(month)],
      currency,
    )
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
    isBitvavoBrokerAccount,
    resolveInvestmentCategory,
    setReturnMode,
    setMonth,
    addMovement,
    markDeclared,
    saveContribution,
  }
})

import { defineStore } from 'pinia'
import { computed, shallowRef } from 'vue'

import { BASE_SEED, EMPTY_STATE_SEED, normalizeState } from '../scripts/state'
import type { State } from '../scripts/types'
import { isDemoMode } from '../scripts/demo-mode'
import { clone } from '../scripts/utils'

type FinanceStoreStatus = 'idle' | 'loading' | 'saving' | 'error'

export const useFinancialStateStore = defineStore('financial-state', () => {
  const state = shallowRef<State>(normalizeState(clone(isDemoMode() ? BASE_SEED : EMPTY_STATE_SEED)))
  const status = shallowRef<FinanceStoreStatus>('idle')
  const errorMessage = shallowRef<string | null>(null)

  const currency = computed(() => state.value.currency)
  const year = computed(() => state.value.year)
  const accounts = computed(() => state.value.accounts)
  const transactions = computed(() => state.value.transactions)
  const subscriptions = computed(() => state.value.subscriptions)
  const budget = computed(() => state.value.budget)
  const goals = computed(() => state.value.goals)
  const investmentAssets = computed(() => state.value.investmentAssets)
  const contributions = computed(() => state.value.contributions)
  const instruments = computed(() => state.value.instruments)
  const quotes = computed(() => state.value.quotes)
  const recurringRules = computed(() => state.value.recurringRules)
  const pendingMovements = computed(() => state.value.pendingMovements)

  function replaceState(nextState: unknown): State {
    const normalized = normalizeState(nextState)
    // Integration credentials live encrypted server-side and must never be
    // retained in the client financial snapshot or its legacy persistence.
    normalized.stockEvents.apiKey = ''
    state.value = normalized
    errorMessage.value = null
    status.value = 'idle'
    return state.value
  }

  function failLoad(message: string): void {
    status.value = 'error'
    errorMessage.value = message
  }

  function patchState(mutator: (draft: State) => void): State {
    const draft = clone(state.value)
    mutator(draft)
    return replaceState(draft)
  }

  function commitState(mutator: (draft: State) => void): State {
    return patchState(mutator)
  }

  return {
    state,
    status,
    errorMessage,
    currency,
    year,
    accounts,
    transactions,
    subscriptions,
    budget,
    goals,
    investmentAssets,
    contributions,
    instruments,
    quotes,
    recurringRules,
    pendingMovements,
    replaceState,
    failLoad,
    patchState,
    commitState,
  }
})

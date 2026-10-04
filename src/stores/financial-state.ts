import { defineStore } from 'pinia'
import { computed, shallowRef } from 'vue'

import { BASE_SEED, EMPTY_STATE_SEED, normalizeState } from '../scripts/state'
import type { State } from '../scripts/types'
import { isSyncV2Enabled } from '../lib/client/feature-flags'
import { isDemoMode } from '../scripts/demo-mode'
import { clone } from '../scripts/utils'

type FinanceStoreStatus = 'idle' | 'loading' | 'saving' | 'error'
type StateCommitHandler = (state: State) => void
type StateReloadHandler = (state: State) => void

export const useFinancialStateStore = defineStore('financial-state', () => {
  const state = shallowRef<State>(normalizeState(clone(isSyncV2Enabled() && !isDemoMode() ? EMPTY_STATE_SEED : BASE_SEED)))
  const status = shallowRef<FinanceStoreStatus>('idle')
  const errorMessage = shallowRef<string | null>(null)
  let stateCommitHandler: StateCommitHandler | undefined
  let stateReloadHandler: StateReloadHandler | undefined

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
    const nextState = patchState(mutator)
    stateCommitHandler?.(nextState)
    return nextState
  }

  function registerStateCommitHandler(handler: StateCommitHandler): void {
    stateCommitHandler = handler
  }

  /**
   * Replaces the whole financial state (imports, seed resets) and notifies the
   * reload handler so any legacy section still rendered imperatively repaints
   * against the new state. Bridges the migration until every section is Vue.
   */
  function reloadState(nextState: unknown): State {
    const next = replaceState(nextState)
    stateReloadHandler?.(next)
    return next
  }

  function registerStateReloadHandler(handler: StateReloadHandler): void {
    stateReloadHandler = handler
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
    registerStateCommitHandler,
    reloadState,
    registerStateReloadHandler,
  }
})

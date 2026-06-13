import { defineStore } from 'pinia'
import { computed, shallowRef } from 'vue'

import { BASE_SEED, normalizeState } from '../scripts/state'
import type { State } from '../scripts/types'
import { clone } from '../scripts/utils'
import { loadStateFromApi, saveStateToApi } from '../services/state-api'

type FinanceStoreStatus = 'idle' | 'loading' | 'saving' | 'error'
type StateCommitHandler = (state: State) => void

export const useFinancialStateStore = defineStore('financial-state', () => {
  const state = shallowRef<State>(normalizeState(clone(BASE_SEED)))
  const status = shallowRef<FinanceStoreStatus>('idle')
  const errorMessage = shallowRef<string | null>(null)
  let stateCommitHandler: StateCommitHandler | undefined

  const currency = computed(() => state.value.currency)
  const year = computed(() => state.value.year)
  const accounts = computed(() => state.value.accounts)
  const transactions = computed(() => state.value.transactions)
  const budget = computed(() => state.value.budget)
  const goals = computed(() => state.value.goals)
  const investmentAssets = computed(() => state.value.investmentAssets)
  const contributions = computed(() => state.value.contributions)

  function replaceState(nextState: unknown): State {
    state.value = normalizeState(nextState)
    errorMessage.value = null
    status.value = 'idle'
    return state.value
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

  async function loadFromApi(): Promise<State | null> {
    status.value = 'loading'
    errorMessage.value = null

    try {
      const nextState = await loadStateFromApi()
      if (!nextState) {
        status.value = 'idle'
        return null
      }
      return replaceState(nextState)
    } catch (error) {
      status.value = 'error'
      errorMessage.value =
        error instanceof Error ? error.message : 'No se pudo cargar el estado financiero'
      return null
    }
  }

  async function saveToApi(): Promise<boolean> {
    status.value = 'saving'
    errorMessage.value = null

    try {
      await saveStateToApi(state.value)
      status.value = 'idle'
      return true
    } catch (error) {
      status.value = 'error'
      errorMessage.value =
        error instanceof Error ? error.message : 'No se pudo guardar el estado financiero'
      return false
    }
  }

  return {
    state,
    status,
    errorMessage,
    currency,
    year,
    accounts,
    transactions,
    budget,
    goals,
    investmentAssets,
    contributions,
    replaceState,
    patchState,
    commitState,
    registerStateCommitHandler,
    loadFromApi,
    saveToApi,
  }
})

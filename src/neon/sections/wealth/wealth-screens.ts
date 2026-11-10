import { defineStore } from 'pinia'
import { ref } from 'vue'

import type { SnapshotKind } from '../../../scripts/types'
import type { EvolutionKind, EvolutionPeriod } from './view-model'

// Presentation state of the new Patrimonio (#435, #436): which of its two
// screens is showing, the cover or «Balance por meses», and how «Cómo ha ido»
// is drawn. The mobile composition adds its own choices: the cover's tab and
// account filter, and which half of «Balance por meses» is open. A store so the
// choices survive leaving the section and coming back; nothing here is
// persisted.

export type WealthScreen = 'home' | 'months'
/** Mobile cover: the accounts, or how the assets are split. */
export type WealthTab = 'accounts' | 'mix'
/** Mobile «Balance por meses»: write down the month, or read every month. */
export type MonthsView = 'close' | 'history'
export type AccountFilter = 'all' | SnapshotKind

export const useNeonWealthScreens = defineStore('neon-wealth-screens', () => {
  const screen = ref<WealthScreen>('home')
  const period = ref<EvolutionPeriod>('month')
  const chartKind = ref<EvolutionKind>('line')
  const tab = ref<WealthTab>('accounts')
  const filter = ref<AccountFilter>('all')
  const monthsView = ref<MonthsView>('close')

  function go(next: WealthScreen, view: MonthsView = 'close'): void {
    screen.value = next
    if (next === 'months') monthsView.value = view
  }

  return { screen, period, chartKind, tab, filter, monthsView, go }
})

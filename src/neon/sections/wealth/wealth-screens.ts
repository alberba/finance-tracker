import { defineStore } from 'pinia'
import { ref } from 'vue'

import type { EvolutionKind, EvolutionPeriod } from './view-model'

// Presentation state of the new Patrimonio (#435): which of its two screens is
// showing, the cover or «Balance por meses», and how «Cómo ha ido» is drawn.
// A store so the choices survive leaving the section and coming back; nothing
// here is persisted.

export type WealthScreen = 'home' | 'months'

export const useNeonWealthScreens = defineStore('neon-wealth-screens', () => {
  const screen = ref<WealthScreen>('home')
  const period = ref<EvolutionPeriod>('month')
  const chartKind = ref<EvolutionKind>('line')

  function go(next: WealthScreen): void {
    screen.value = next
  }

  return { screen, period, chartKind, go }
})

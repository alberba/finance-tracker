import { computed, shallowRef, watch, type Ref } from 'vue'

import {
  buildPositionEvolution,
  type PositionEvolution,
} from '../../../domain/investment/position-evolution'
import type { AccountPosition } from '../../../domain/investment/positions'
import { runClientHttp } from '../../../lib/client/runtime'
import type { Month } from '../../../lib/month'
import type { State } from '../../../scripts/types'
import { fetchInstrumentCloses } from '../../../services/market-api'

/**
 * The evolution of each position of the open account: its units at each month
 * close by the instrument's monthly close of the year. An instrument whose
 * closes fail to load, or that has none, takes a share of the account's value
 * instead (the domain's rule), so the detail draws without them meanwhile.
 * Loads the closes once per account and year, and nothing while no account is
 * open.
 */
export function useAccountEvolution(source: {
  state: Ref<State>
  month: Ref<Month>
  /** The open account, or null on the cover. */
  accountId: Ref<string | null>
  positions: Ref<readonly AccountPosition[]>
}): Ref<PositionEvolution[]> {
  const { state, month, accountId, positions } = source
  const loaded = shallowRef<{ key: string; closes: Record<string, number[]> } | null>(null)

  watch(
    [accountId, () => state.value.year, () => positions.value.length],
    async ([id, year]) => {
      if (!id) return
      const key = `${id}:${year}`
      if (loaded.value?.key === key) return
      const held = positions.value.filter((position) => position.accountId === id)
      // A direct link can open the detail before the state is in: wait for the positions.
      if (!held.length) return
      const found: Record<string, number[]> = {}
      await Promise.all(
        held.map(async ({ instrumentId }) => {
          const instrument = state.value.instruments.find((item) => item.id === instrumentId)
          if (!instrument) return
          try {
            const closes = await runClientHttp(fetchInstrumentCloses(instrument, year))
            if (closes.length) found[instrumentId] = closes
          } catch {
            // No history for this instrument: its line is the account's share.
          }
        }),
      )
      if (accountId.value === id && state.value.year === year) {
        loaded.value = { key, closes: found }
      }
    },
    { immediate: true },
  )

  return computed(() => {
    const id = accountId.value
    if (!id || loaded.value?.key !== `${id}:${state.value.year}`) return []
    return buildPositionEvolution(state.value, id, month.value, loaded.value.closes)
  })
}

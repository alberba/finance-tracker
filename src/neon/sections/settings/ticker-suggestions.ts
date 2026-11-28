import { shallowRef, watch, type ShallowRef } from 'vue'

import { suggestYahooTicker } from '../../../domain/investment/ticker-suggestion'
import { runClientHttp } from '../../../lib/client/runtime'
import { fetchSymbolCandidates } from '../../../services/market-api'

/**
 * The Yahoo ticker proposed for each movement symbol (`XDWH` → `XDWH.DE`) of
 * the assets still without one, searched one at a time as they appear. A symbol
 * Yahoo does not know, or a failed search, simply gets no proposal.
 */
export function useTickerSuggestions(
  symbols: () => readonly string[],
): ShallowRef<Readonly<Record<string, string>>> {
  const suggestions = shallowRef<Record<string, string>>({})
  const asked = new Set<string>()
  let queue = Promise.resolve()

  watch(
    () => symbols().filter(Boolean).join('|'),
    () => {
      for (const symbol of symbols()) {
        if (!symbol || asked.has(symbol)) continue
        asked.add(symbol)
        queue = queue.then(async () => {
          try {
            const ticker = suggestYahooTicker(
              symbol,
              await runClientHttp(fetchSymbolCandidates(symbol)),
            )
            if (ticker) suggestions.value = { ...suggestions.value, [symbol]: ticker }
          } catch {
            // No proposal: the field stays empty for the user to fill.
          }
        })
      }
    },
    { immediate: true },
  )
  return suggestions
}

import { computed, type ComputedRef } from 'vue'

import { useLiveQuotes } from '../../composables/useLiveQuotes'
import { summarizeQuoteStatus } from '../../domain/investment/quote-status'
import { formatTime } from '../../lib/format'
import { useMarketStore } from '../../stores/market'

export interface QuotesNote {
  /** The full note of the Inversiones card. */
  text: string
  /** The short one of a row («cotización de las 17:35»). */
  short: string
  late: boolean
}

/**
 * When the portfolio's quotes were taken, refreshed while the caller is
 * mounted. Quotes are never shown as real time: the note says when they were
 * taken, or that they are late. Null with no quote yet.
 */
export function useQuotesNote(): ComputedRef<QuotesNote | null> {
  const marketStore = useMarketStore()
  useLiveQuotes()
  return computed(() => {
    const summary = summarizeQuoteStatus(marketStore.valuation.instruments)
    if (!summary) return null
    if (summary.status !== 'fresh') {
      return {
        text: 'Cotizaciones retrasadas: se muestra el último precio válido',
        short: 'cotizaciones retrasadas',
        late: true,
      }
    }
    const time = formatTime(summary.latest)
    return {
      text: `Cotizaciones de las ${time} · pueden ir con retraso`,
      short: `cotización de las ${time}`,
      late: false,
    }
  })
}

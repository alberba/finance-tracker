import { onMounted, onUnmounted, watch } from 'vue'

import { useMarketStore } from '../stores/market'

/**
 * Keeps market quotes live while the calling component is mounted: refreshes
 * them on mount, again (forced) whenever the configured instruments change,
 * and keeps the shared market clock running so fresh/stale follows real time.
 */
export function useLiveQuotes(): void {
  const marketStore = useMarketStore()
  let stopClock: (() => void) | undefined

  onMounted(() => {
    void marketStore.refreshQuotes()
    stopClock = marketStore.startClock()
  })

  onUnmounted(() => stopClock?.())

  watch(
    () =>
      marketStore.instruments
        .map(
          (instrument) =>
            `${instrument.id}:${instrument.provider}:${instrument.symbol}:${instrument.currency}`,
        )
        .join('|'),
    (signature, previousSignature) => {
      if (signature && signature !== previousSignature) void marketStore.refreshQuotes(true)
    },
  )
}

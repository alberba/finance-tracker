import { onMounted, onUnmounted, watch } from 'vue'

import { useMarketStore } from '../stores/market'
import { quoteSourceKey } from '../domain/investment/symbol-matching'

const REFRESH_INTERVAL_MS = 5 * 60_000

/**
 * Keeps market quotes live while the calling component is mounted: refreshes
 * them on mount, every five minutes while visible and online, and whenever instruments change,
 * and keeps the shared market clock running so fresh/stale follows real time.
 */
export function useLiveQuotes(): void {
  const marketStore = useMarketStore()
  let stopClock: (() => void) | undefined
  let refreshTimer: ReturnType<typeof setInterval> | undefined

  function refreshWhenVisible(): void {
    if (document.visibilityState === 'hidden' || !navigator.onLine) return
    void marketStore.refreshQuotes()
  }

  onMounted(() => {
    refreshWhenVisible()
    stopClock = marketStore.startClock()
    refreshTimer = setInterval(refreshWhenVisible, REFRESH_INTERVAL_MS)
    document.addEventListener('visibilitychange', refreshWhenVisible)
  })

  onUnmounted(() => {
    stopClock?.()
    clearInterval(refreshTimer)
    document.removeEventListener('visibilitychange', refreshWhenVisible)
  })

  watch(
    () =>
      marketStore.instruments
        .map((instrument) => `${instrument.id}:${quoteSourceKey(instrument)}`)
        .join('|'),
    (signature, previousSignature) => {
      if (signature && signature !== previousSignature) void marketStore.refreshQuotes(true)
    },
  )
}

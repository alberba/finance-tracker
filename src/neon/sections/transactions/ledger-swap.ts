import { nextTick } from 'vue'

/**
 * Applies a filter change that swaps the registry's list as one crossfade
 * (View Transitions): the old list fades out while the new one fades in over
 * it, and the ledger's height eases to the new one (the styles live in
 * NeonRegistry, `tx-ledger`). Without the API or with reduced motion the change
 * is immediate. Typing in the search does not go through here.
 */
export function swapLedger(update: () => void): void {
  if (
    typeof document.startViewTransition !== 'function' ||
    window.matchMedia('(prefers-reduced-motion: reduce)').matches
  ) {
    update()
    return
  }
  document.startViewTransition(async () => {
    update()
    await nextTick()
  })
}

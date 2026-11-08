import { ref, shallowRef } from 'vue'

import type { PendingMovement } from '../scripts/types'

/**
 * Whether the new design's entry sheet (the «Apuntar» sheet, DESIGN.md
 * «Hoja / panel de alta») is open, and what it holds: nothing for a new
 * movement, or the pending movement it edits and confirms. Module-level so the
 * islands that open it (the FAB, the sidebar button, «Por confirmar») and the
 * sheet itself share one state, whatever Vue app each is mounted in.
 */
const open = ref(false)
const pending = shallowRef<PendingMovement | null>(null)
let returnFocusTo: HTMLElement | null = null

export function useEntrySheet() {
  return {
    open,
    /** The pending movement being edited, or null for a new movement. */
    pending,
    openEntrySheet(): void {
      pending.value = null
      returnFocusTo = null
      open.value = true
    },
    /**
     * Opens the sheet on a copy of a pending movement, to change it and confirm
     * it in one step. `returnTo` gets the focus back on close when what was
     * pressed goes away with the sheet opening (a row in a closing panel).
     */
    openPendingEdit(item: PendingMovement, returnTo?: HTMLElement | null): void {
      pending.value = { ...item }
      returnFocusTo = returnTo ?? null
      open.value = true
    },
    closeEntrySheet(): void {
      open.value = false
    },
    /** Hands over, once, the element that should take the focus back on close. */
    takeReturnFocus(): HTMLElement | null {
      const element = returnFocusTo
      returnFocusTo = null
      return element
    },
  }
}

import { ref, shallowRef } from 'vue'

import type { InvestmentSide, PendingMovement } from '../scripts/types'

/** What an investment opened from an asset starts with: its operation and the asset's last one. */
export interface InvestmentEntryPreset {
  side: InvestmentSide
  symbol: string
  category: string
  accountId?: string
  currency?: string
}

/**
 * Whether the entry sheet (the «Apuntar» sheet, DESIGN.md
 * «Hoja / panel de alta») is open, and what it holds: nothing for a new
 * movement, or the pending movement it edits and confirms. Module-level so the
 * islands that open it (the FAB, the sidebar button, «Por confirmar») and the
 * sheet itself share one state, whatever Vue app each is mounted in.
 */
const open = ref(false)
const pending = shallowRef<PendingMovement | null>(null)
const investmentPreset = shallowRef<InvestmentEntryPreset | null>(null)
let returnFocusTo: HTMLElement | null = null

export function useEntrySheet() {
  return {
    open,
    /** The pending movement being edited, or null for a new movement. */
    pending,
    /** The asset and operation an investment opened from Comprar / Vender starts with. */
    investmentPreset,
    openEntrySheet(event?: MouseEvent): void {
      pending.value = null
      investmentPreset.value = null
      returnFocusTo = event?.currentTarget instanceof HTMLElement ? event.currentTarget : null
      open.value = true
    },
    /** Opens the sheet on a purchase or a sale of one asset, already filled in. */
    openInvestmentEntry(preset: InvestmentEntryPreset, event?: MouseEvent): void {
      pending.value = null
      investmentPreset.value = preset
      returnFocusTo = event?.currentTarget instanceof HTMLElement ? event.currentTarget : null
      open.value = true
    },
    /**
     * Opens the sheet on a copy of a pending movement, to change it and confirm
     * it in one step. `returnTo` gets the focus back on close when what was
     * pressed goes away with the sheet opening (a row in a closing panel).
     */
    openPendingEdit(item: PendingMovement, returnTo?: HTMLElement | null): void {
      pending.value = { ...item }
      investmentPreset.value = null
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

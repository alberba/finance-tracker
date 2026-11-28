import { onBeforeUnmount, onMounted, ref } from 'vue'

// The route of an asset's detail (#439): `/inversion?activo=<id>`. Opening it
// pushes a history entry, so the browser's back button leaves it the same way
// the arrow does; a link to it loads straight into the detail. On the mobile
// frame the detail has a second screen, its movements (#440):
// `&vista=movimientos`, an entry of its own too, so back goes from the
// movements to the summary and from there to the cover. This is the one module
// of the section that touches `location`, `history` and the document: it also
// scrolls to the top and moves focus when the page changes, and sends the
// section's own nav item back to the cover.
//
// An instrument has its own detail, a route apart from the account's:
// `/inversion?instrumento=<id>` (#561, `instrumentHref`). It is an entry of its
// own as well, pushed from wherever it was opened (an account's positions, or
// the cover grouped by instrument), so back returns there; a loaded link has
// nothing under it and goes to the cover.

const PARAM = 'activo'
const INSTRUMENT = 'instrumento'
const VIEW = 'vista'
const MOVEMENTS = 'movimientos'
/** The history state holds how many entries the detail pushed on top of the cover. */
const MARK = 'neon-investment-asset'

function readUrl(): { selected: string | null; movements: boolean; instrument: string | null } {
  const params = new URLSearchParams(window.location.search)
  // The instrument's detail wins over an account's: they are never both open.
  const instrument = params.get(INSTRUMENT) || null
  const selected = instrument ? null : params.get(PARAM) || null
  return {
    selected,
    movements: selected !== null && params.get(VIEW) === MOVEMENTS,
    instrument,
  }
}

function depth(): number {
  const value: unknown = window.history.state?.[MARK]
  return typeof value === 'number' && value > 0 ? value : 0
}

function urlWith(change: (params: URLSearchParams) => void): string {
  const url = new URL(window.location.href)
  change(url.searchParams)
  return `${url.pathname}${url.search}${url.hash}`
}

/** The address of an asset's detail (its summary). */
export function assetHref(id: string): string {
  return `/inversion?${new URLSearchParams({ [PARAM]: id })}`
}

/** The address of an instrument's detail. */
export function instrumentHref(id: string): string {
  return `/inversion?${new URLSearchParams({ [INSTRUMENT]: id })}`
}

export function useAssetRoute() {
  const selected = ref<string | null>(null)
  const instrument = ref<string | null>(null)
  const movements = ref(false)
  // Going back to the cover from an entry that was loaded, not pushed: once
  // history lands there, the URL is rewritten.
  let leaving = false

  function sync(): void {
    const url = readUrl()
    if (leaving) {
      leaving = false
      if (url.selected !== null || url.instrument !== null) {
        rewriteToCover()
        return
      }
    }
    selected.value = url.selected
    movements.value = url.movements
    instrument.value = url.instrument
  }

  function rewriteToCover(): void {
    window.history.replaceState(
      null,
      '',
      urlWith((params) => {
        params.delete(PARAM)
        params.delete(VIEW)
        params.delete(INSTRUMENT)
      }),
    )
    selected.value = null
    movements.value = false
    instrument.value = null
  }

  function open(id: string): void {
    const url = urlWith((params) => {
      params.set(PARAM, id)
      params.delete(VIEW)
      params.delete(INSTRUMENT)
    })
    window.history.pushState({ [MARK]: depth() + 1 }, '', url)
    selected.value = id
    movements.value = false
    instrument.value = null
  }

  /** The detail of an instrument, from an account or from the cover. */
  function openInstrument(id: string): void {
    const url = urlWith((params) => {
      params.delete(PARAM)
      params.delete(VIEW)
      params.set(INSTRUMENT, id)
    })
    window.history.pushState({ [MARK]: depth() + 1 }, '', url)
    selected.value = null
    movements.value = false
    instrument.value = id
  }

  /** Back from the instrument to where it was opened, or to the cover for a loaded link. */
  function closeInstrument(): void {
    if (instrument.value === null) return
    if (depth() > 0) {
      window.history.back()
      return
    }
    rewriteToCover()
  }

  /** Back to the cover: undoes the entries the detail pushed, or rewrites the URL of a loaded link. */
  function close(): void {
    if (selected.value === null && instrument.value === null) return
    const pushed = depth()
    if (pushed === 0) {
      rewriteToCover()
      return
    }
    leaving = true
    window.history.go(-pushed)
  }

  /** The movements of the open asset (mobile frame). */
  function openMovements(): void {
    if (selected.value === null || movements.value) return
    const url = urlWith((params) => params.set(VIEW, MOVEMENTS))
    window.history.pushState({ [MARK]: depth() + 1 }, '', url)
    movements.value = true
  }

  /** From the movements back to the asset's summary. */
  function closeMovements(): void {
    if (!movements.value) return
    // A pushed movements entry has the summary right under it.
    if (depth() > 0) {
      window.history.back()
      return
    }
    // A link loaded straight into the movements.
    window.history.replaceState(
      window.history.state,
      '',
      urlWith((params) => params.delete(VIEW)),
    )
    movements.value = false
  }

  /** The section is no longer on screen: its detail goes with it, the URL already moved on. */
  function reset(): void {
    selected.value = null
    movements.value = false
    instrument.value = null
    leaving = false
  }

  /** The nav item of the section you are in brings you back to its cover. */
  function onNavClick(event: MouseEvent): void {
    if (!(event.target instanceof Element)) return
    if (event.target.closest('[data-nav-item][data-section="investment"]')) close()
  }

  onMounted(() => {
    sync()
    window.addEventListener('popstate', sync)
    document.addEventListener('click', onNavClick)
  })
  onBeforeUnmount(() => {
    window.removeEventListener('popstate', sync)
    document.removeEventListener('click', onNavClick)
  })

  return {
    selected,
    movements,
    instrument,
    open,
    close,
    openMovements,
    closeMovements,
    openInstrument,
    closeInstrument,
    reset,
  }
}

/** A new page starts: back to the top and the focus on its heading, for keyboards and screen readers. */
export function startPage(titleId: string): void {
  window.scrollTo?.({ top: 0 })
  document.getElementById(titleId)?.focus({ preventScroll: true })
}

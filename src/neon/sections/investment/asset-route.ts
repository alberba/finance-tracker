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

const PARAM = 'activo'
const VIEW = 'vista'
const MOVEMENTS = 'movimientos'
/** The history state holds how many entries the detail pushed on top of the cover. */
const MARK = 'neon-investment-asset'

function readUrl(): { selected: string | null; movements: boolean } {
  const params = new URLSearchParams(window.location.search)
  const selected = params.get(PARAM) || null
  return { selected, movements: selected !== null && params.get(VIEW) === MOVEMENTS }
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

export function useAssetRoute() {
  const selected = ref<string | null>(null)
  const movements = ref(false)
  // Going back to the cover from an entry that was loaded, not pushed: once
  // history lands there, the URL is rewritten.
  let leaving = false

  function sync(): void {
    const url = readUrl()
    if (leaving) {
      leaving = false
      if (url.selected !== null) {
        rewriteToCover()
        return
      }
    }
    selected.value = url.selected
    movements.value = url.movements
  }

  function rewriteToCover(): void {
    window.history.replaceState(
      null,
      '',
      urlWith((params) => {
        params.delete(PARAM)
        params.delete(VIEW)
      }),
    )
    selected.value = null
    movements.value = false
  }

  function open(id: string): void {
    const url = urlWith((params) => {
      params.set(PARAM, id)
      params.delete(VIEW)
    })
    window.history.pushState({ [MARK]: depth() + 1 }, '', url)
    selected.value = id
    movements.value = false
  }

  /** Back to the cover: undoes the entries the detail pushed, or rewrites the URL of a loaded link. */
  function close(): void {
    if (selected.value === null) return
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

  return { selected, movements, open, close, openMovements, closeMovements, reset }
}

/** A new page starts: back to the top and the focus on its heading, for keyboards and screen readers. */
export function startPage(titleId: string): void {
  window.scrollTo?.({ top: 0 })
  document.getElementById(titleId)?.focus({ preventScroll: true })
}

import { onBeforeUnmount, onMounted, ref } from 'vue'

// The route of an asset's detail (#439): `/inversion?activo=<id>`. Opening it
// pushes a history entry, so the browser's back button leaves it the same way
// the arrow does; a link to it loads straight into the detail. This is the one
// module of the section that touches `location` and `history`.

const PARAM = 'activo'
const MARK = 'neon-investment-asset'

function readSelected(): string | null {
  return new URLSearchParams(window.location.search).get(PARAM) || null
}

export function useAssetRoute() {
  const selected = ref<string | null>(null)

  function sync(): void {
    selected.value = readSelected()
  }

  function open(id: string): void {
    const url = new URL(window.location.href)
    url.searchParams.set(PARAM, id)
    window.history.pushState({ [MARK]: true }, '', `${url.pathname}${url.search}${url.hash}`)
    selected.value = id
  }

  /** Back to the cover: undoes the entry the detail pushed, or rewrites the URL of a loaded link. */
  function close(): void {
    if (selected.value === null) return
    if (window.history.state?.[MARK]) {
      window.history.back()
      return
    }
    const url = new URL(window.location.href)
    url.searchParams.delete(PARAM)
    window.history.replaceState(null, '', `${url.pathname}${url.search}${url.hash}`)
    selected.value = null
  }

  /** The section is no longer on screen: its detail goes with it, the URL already moved on. */
  function reset(): void {
    selected.value = null
  }

  onMounted(() => {
    sync()
    window.addEventListener('popstate', sync)
  })
  onBeforeUnmount(() => window.removeEventListener('popstate', sync))

  return { selected, open, close, reset }
}

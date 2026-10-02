const TOAST_VISIBLE_MS = 2200

let toastTimer: ReturnType<typeof setTimeout> | undefined

/**
 * Shared toast helper for Vue islands. Targets the global `#toast` element
 * rendered by the app shell so feedback stays visually identical to the
 * legacy imperative sections during the migration.
 */
export function useToast() {
  function showToast(message: string): void {
    if (typeof document === 'undefined') {
      return
    }
    const toast = document.getElementById('toast')
    if (!toast) {
      return
    }

    toast.textContent = message
    toast.classList.add('show')

    if (toastTimer) {
      clearTimeout(toastTimer)
    }
    toastTimer = setTimeout(() => {
      toast.classList.remove('show')
    }, TOAST_VISIBLE_MS)
  }

  return { showToast }
}

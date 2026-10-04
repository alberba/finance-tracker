const TOAST_VISIBLE_MS = 2200

let toastTimer: ReturnType<typeof setTimeout> | undefined

/**
 * Shows a short message in the shell's `#toast` (ink surface, bottom right on
 * desktop, above the bottom bar on mobile). One toast at a time: a new
 * message replaces the current one and restarts its timer.
 */
export function showToast(message: string): void {
  if (typeof document === 'undefined') {
    return
  }
  const toast = document.getElementById('toast')
  if (!toast) {
    return
  }

  toast.textContent = message
  toast.dataset.visible = ''

  clearTimeout(toastTimer)
  toastTimer = setTimeout(() => {
    delete toast.dataset.visible
  }, TOAST_VISIBLE_MS)
}

import { ref } from 'vue'

/**
 * Whether the «Por confirmar» sheet of the mobile frame is open. Module-level
 * so the top bar island that owns the sheet and the dashboard, which opens it
 * from its figure, share one state whatever Vue app each is mounted in.
 */
const open = ref(false)

export function usePendingSheet() {
  return {
    open,
    openPendingSheet(): void {
      open.value = true
    },
  }
}

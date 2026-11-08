import { ref } from 'vue'

/**
 * Whether the new design's entry sheet (the «Apuntar» sheet, DESIGN.md
 * «Hoja / panel de alta») is open. Module-level so the islands that open it
 * (the FAB, the sidebar button) and the sheet itself share one flag, whatever
 * Vue app each is mounted in.
 */
const open = ref(false)

export function useEntrySheet() {
  return {
    open,
    openEntrySheet(): void {
      open.value = true
    },
    closeEntrySheet(): void {
      open.value = false
    },
  }
}

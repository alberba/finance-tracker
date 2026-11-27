import { onMounted, shallowRef, type ShallowRef } from 'vue'

function useBarSlot(selector: string): ShallowRef<HTMLElement | null> {
  const slot = shallowRef<HTMLElement | null>(null)
  onMounted(() => {
    slot.value = document.querySelector<HTMLElement>(selector)
  })
  return slot
}

/**
 * The title slot of the mobile top bar (NeonTopBar, `[data-bar-title-slot]`),
 * once mounted; null without a bar (the desktop frame, a test). The bar is
 * static markup of the frame, so a section reaches it from the document.
 */
export function useBarTitleSlot(): ShallowRef<HTMLElement | null> {
  return useBarSlot('[data-bar-title-slot]')
}

/**
 * The slot for a section's own button among the top bar's actions, between
 * «Por confirmar» and search (`[data-bar-actions-slot]`); null without a bar.
 */
export function useBarActionsSlot(): ShallowRef<HTMLElement | null> {
  return useBarSlot('[data-bar-actions-slot]')
}

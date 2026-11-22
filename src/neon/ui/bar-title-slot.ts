import { onMounted, shallowRef, type ShallowRef } from 'vue'

/**
 * The title slot of the mobile top bar (NeonTopBar, `[data-bar-title-slot]`),
 * once mounted; null without a bar (the desktop frame, a test). The bar is
 * static markup of the frame, so a section reaches it from the document.
 */
export function useBarTitleSlot(): ShallowRef<HTMLElement | null> {
  const slot = shallowRef<HTMLElement | null>(null)
  onMounted(() => {
    slot.value = document.querySelector<HTMLElement>('[data-bar-title-slot]')
  })
  return slot
}
